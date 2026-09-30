import { DateTime } from "luxon";
import { z } from "zod";
import { query, withTransaction } from "./db";
import { buildStops, TripShapeError } from "./geo";
import { mongo } from "./mongo";
import { assess } from "./risk";
import { ENGINE_VERSION, type Airport, type Assessment, type Leg, type Level, type Signal, type SourceStatus, type Stop, type StopScore } from "./types";

// ---------- Reference data ----------

type AirportRow = { iata: string; name: string; city: string; state: string | null; lat: number; lon: number; timezone: string };
const toAirport = (r: AirportRow): Airport => ({ iata: r.iata.trim(), name: r.name, city: r.city, state: r.state, lat: Number(r.lat), lon: Number(r.lon), timezone: r.timezone });

export async function listAirports(): Promise<Airport[]> {
  return (await query<AirportRow>("SELECT * FROM airports ORDER BY city, iata")).map(toAirport);
}
export async function listAirlines(): Promise<{ code: string; name: string }[]> {
  return query("SELECT code, name FROM airlines ORDER BY name");
}

// ---------- Create ----------

export const legInput = z.object({
  airlineCode: z.string().min(2).max(3),
  flightNo: z.string().max(10).optional().default(""),
  origin: z.string().length(3),
  dest: z.string().length(3),
  depDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  depTime: z.string().regex(/^\d{2}:\d{2}$/),
});
export const tripInput = z.object({ legs: z.array(legInput).min(1, "Add at least one flight.").max(3, "A trip can have at most 2 connections.") });
export type TripInput = z.infer<typeof tripInput>;

export class ValidationError extends Error {}

async function resolveLegs(input: TripInput): Promise<Leg[]> {
  const codes = [...new Set(input.legs.flatMap((l) => [l.origin.toUpperCase(), l.dest.toUpperCase()]))];
  const airports = (await query<AirportRow>("SELECT * FROM airports WHERE iata = ANY($1)", [codes])).map(toAirport);
  const byCode = new Map(airports.map((a) => [a.iata, a]));
  const airlines = new Map((await listAirlines()).map((a) => [a.code, a.name]));
  return input.legs.map((l, i) => {
    const origin = byCode.get(l.origin.toUpperCase());
    const dest = byCode.get(l.dest.toUpperCase());
    if (!origin) throw new ValidationError(`Flight ${i + 1}: we don't know airport "${l.origin}". Pick one from the list.`);
    if (!dest) throw new ValidationError(`Flight ${i + 1}: we don't know airport "${l.dest}". Pick one from the list.`);
    const airlineName = airlines.get(l.airlineCode.toUpperCase());
    if (!airlineName) throw new ValidationError(`Flight ${i + 1}: choose an airline.`);
    return { seq: i + 1, airlineCode: l.airlineCode.toUpperCase(), airlineName, flightNo: l.flightNo?.trim() || null, origin, dest, depDate: l.depDate, depTime: l.depTime };
  });
}

export async function createTrip(userId: number, input: TripInput): Promise<number> {
  const legs = await resolveLegs(input);
  try {
    buildStops(legs); // validates connections and times before anything is saved
  } catch (e) {
    if (e instanceof TripShapeError) throw new ValidationError(e.message);
    throw e;
  }
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ id: string }>("INSERT INTO trips (user_id, travel_date) VALUES ($1, $2) RETURNING id", [userId, legs[0].depDate]);
    const tripId = Number(rows[0].id);
    for (const l of legs) {
      await c.query(
        `INSERT INTO trip_legs (trip_id, seq, airline_code, flight_no, origin_iata, dest_iata, dep_date, dep_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tripId, l.seq, l.airlineCode, l.flightNo, l.origin.iata, l.dest.iata, l.depDate, l.depTime],
      );
    }
    return tripId;
  });
}

// ---------- Read ----------

type LegRow = {
  seq: number; airline_code: string; airline_name: string; flight_no: string | null; dep_date: string; dep_time: string;
  o_iata: string; o_name: string; o_city: string; o_state: string | null; o_lat: number; o_lon: number; o_tz: string;
  d_iata: string; d_name: string; d_city: string; d_state: string | null; d_lat: number; d_lon: number; d_tz: string;
};

export type TripRecord = { id: number; userId: number; travelDate: string; alertsEnabled: boolean; legs: Leg[]; stops: Stop[] };

export async function loadTrip(tripId: number, userId?: number): Promise<TripRecord | null> {
  const trips = await query<{ id: string; user_id: string; travel_date: string; alerts_enabled: boolean }>(
    `SELECT id, user_id, to_char(travel_date,'YYYY-MM-DD') AS travel_date, alerts_enabled FROM trips WHERE id = $1 ${userId ? "AND user_id = $2" : ""}`,
    userId ? [tripId, userId] : [tripId],
  );
  if (trips.length === 0) return null;
  const rows = await query<LegRow>(
    `SELECT l.seq, l.airline_code, al.name AS airline_name, l.flight_no,
            to_char(l.dep_date,'YYYY-MM-DD') AS dep_date, to_char(l.dep_time,'HH24:MI') AS dep_time,
            o.iata o_iata, o.name o_name, o.city o_city, o.state o_state, o.lat o_lat, o.lon o_lon, o.timezone o_tz,
            d.iata d_iata, d.name d_name, d.city d_city, d.state d_state, d.lat d_lat, d.lon d_lon, d.timezone d_tz
     FROM trip_legs l JOIN airlines al ON al.code = l.airline_code
     JOIN airports o ON o.iata = l.origin_iata JOIN airports d ON d.iata = l.dest_iata
     WHERE l.trip_id = $1 ORDER BY l.seq`, [tripId]);
  const legs: Leg[] = rows.map((r) => ({
    seq: Number(r.seq), airlineCode: r.airline_code, airlineName: r.airline_name, flightNo: r.flight_no, depDate: r.dep_date, depTime: r.dep_time,
    origin: toAirport({ iata: r.o_iata, name: r.o_name, city: r.o_city, state: r.o_state, lat: r.o_lat, lon: r.o_lon, timezone: r.o_tz }),
    dest: toAirport({ iata: r.d_iata, name: r.d_name, city: r.d_city, state: r.d_state, lat: r.d_lat, lon: r.d_lon, timezone: r.d_tz }),
  }));
  const t = trips[0];
  return { id: Number(t.id), userId: Number(t.user_id), travelDate: t.travel_date, alertsEnabled: t.alerts_enabled, legs, stops: buildStops(legs) };
}

export type TripSummary = { id: number; travelDate: string; route: string; flights: string; level: Level | null; probability: number | null; checkedAt: string | null };

export async function listTrips(userId: number): Promise<TripSummary[]> {
  const rows = await query<{ id: string; travel_date: string; route: string; flights: string; level: Level | null; probability: number | null; checked_at: Date | null }>(
    `SELECT t.id, to_char(t.travel_date,'YYYY-MM-DD') travel_date,
            (SELECT string_agg(x, ' → ') FROM (SELECT l2.origin_iata::text x, 0 o FROM trip_legs l2 WHERE l2.trip_id = t.id AND l2.seq = 1
               UNION ALL SELECT l3.dest_iata::text, l3.seq FROM trip_legs l3 WHERE l3.trip_id = t.id ORDER BY 2) s) route,
            (SELECT string_agg(coalesce(l.flight_no, l.airline_code), ' + ' ORDER BY l.seq) FROM trip_legs l WHERE l.trip_id = t.id) flights,
            a.level, a.probability, a.checked_at
     FROM trips t
     LEFT JOIN LATERAL (SELECT level, probability, checked_at FROM risk_assessments ra WHERE ra.trip_id = t.id ORDER BY checked_at DESC LIMIT 1) a ON true
     WHERE t.user_id = $1 ORDER BY t.travel_date DESC, t.id DESC LIMIT 50`, [userId]);
  return rows.map((r) => ({ id: Number(r.id), travelDate: r.travel_date, route: r.route, flights: r.flights, level: r.level, probability: r.probability, checkedAt: r.checked_at?.toISOString() ?? null }));
}

export async function setAlerts(tripId: number, userId: number, enabled: boolean): Promise<boolean> {
  const rows = await query("UPDATE trips SET alerts_enabled = $3 WHERE id = $1 AND user_id = $2 RETURNING id", [tripId, userId, enabled]);
  return rows.length > 0;
}

// ---------- Check ----------

async function baselineSignals(trip: TripRecord, now: Date): Promise<Signal[]> {
  const out: Signal[] = [];
  for (const l of trip.legs) {
    const month = DateTime.fromISO(l.depDate).month;
    const rows = await query<{ late_15_rate: number; cancel_rate: number; flights_counted: number }>(
      "SELECT late_15_rate, cancel_rate, flights_counted FROM route_baselines WHERE origin_iata = $1 AND dest_iata = $2 AND month = $3",
      [l.origin.iata, l.dest.iata, month]);
    const b = rows[0];
    if (!b || b.flights_counted < 30) continue;
    out.push({
      source: "bts", sourceLabel: "Past on-time data (BTS)", airport: l.dest.iata, kind: "baseline",
      probability: Math.min(0.3, b.late_15_rate * 0.5 + b.cancel_rate),
      text: `${Math.round(b.late_15_rate * 100)}% of ${l.origin.iata} → ${l.dest.iata} flights ran 15+ min late in ${DateTime.fromISO(l.depDate).toFormat("LLLL")}.`,
      observedAt: now.toISOString(),
    });
  }
  return out;
}

export type StoredAssessment = {
  id: number; tripId: number; checkedAt: string; probability: number; level: Level; headline: string;
  stops: StopScore[]; signals: Signal[]; sources: SourceStatus[];
};

/** Runs every source, scores the trip, saves scores in Postgres and evidence in MongoDB. */
export async function runCheck(tripId: number): Promise<{ assessment: StoredAssessment; previousLevel: Level | null }> {
  const trip = await loadTrip(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const now = new Date();
  const ctx = { stops: trip.stops, legs: trip.legs, now };
  const result: Assessment = await assess(ctx, await baselineSignals(trip, now));

  const prev = await query<{ level: Level }>("SELECT level FROM risk_assessments WHERE trip_id = $1 ORDER BY checked_at DESC LIMIT 1", [tripId]);
  const ok = result.sources.filter((s) => s.ok).length;
  const id = await withTransaction(async (c) => {
    const { rows } = await c.query<{ id: string; checked_at: Date }>(
      `INSERT INTO risk_assessments (trip_id, probability, level, headline, engine_version, sources_ok, sources_failed)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, checked_at`,
      [tripId, result.probability, result.level, result.headline, ENGINE_VERSION, ok, result.sources.length - ok]);
    const aid = Number(rows[0].id);
    for (const s of result.stops) {
      await c.query("INSERT INTO assessment_stops (assessment_id, seq, airport_iata, role, probability, level, main_reason) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [aid, s.seq, s.iata, s.role, s.probability, s.level, s.mainReason]);
    }
    return aid;
  });

  try {
    const db = await mongo();
    await db.collection("evidence").insertOne({ assessmentId: id, tripId, createdAt: now, signals: result.signals, sources: result.sources });
  } catch (e) {
    console.warn(`[evidence] could not store evidence for assessment ${id}:`, (e as Error).message);
  }

  return {
    assessment: { id, tripId, checkedAt: now.toISOString(), probability: result.probability, level: result.level, headline: result.headline, stops: result.stops, signals: result.signals, sources: result.sources },
    previousLevel: prev[0]?.level ?? null,
  };
}

export async function latestAssessment(tripId: number): Promise<StoredAssessment | null> {
  const rows = await query<{ id: string; checked_at: Date; probability: number; level: Level; headline: string }>(
    "SELECT id, checked_at, probability, level, headline FROM risk_assessments WHERE trip_id = $1 ORDER BY checked_at DESC LIMIT 1", [tripId]);
  if (rows.length === 0) return null;
  const a = rows[0];
  const stops = await query<{ seq: number; airport_iata: string; role: StopScore["role"]; probability: number; level: Level; main_reason: string }>(
    "SELECT seq, airport_iata, role, probability, level, main_reason FROM assessment_stops WHERE assessment_id = $1 ORDER BY seq", [a.id]);
  let signals: Signal[] = [], sources: SourceStatus[] = [];
  try {
    const doc = await (await mongo()).collection("evidence").findOne({ assessmentId: Number(a.id) });
    signals = (doc?.signals as Signal[]) ?? [];
    sources = (doc?.sources as SourceStatus[]) ?? [];
  } catch (e) {
    console.warn("[evidence] could not load evidence:", (e as Error).message);
  }
  return {
    id: Number(a.id), tripId, checkedAt: a.checked_at.toISOString(), probability: Number(a.probability), level: a.level, headline: a.headline,
    stops: stops.map((s) => ({ seq: Number(s.seq), iata: s.airport_iata.trim(), role: s.role, probability: Number(s.probability), level: s.level, mainReason: s.main_reason })),
    signals, sources,
  };
}

export async function baggageRule(airlineCode: string, cabin = "economy") {
  const rows = await query<{ airline_code: string; name: string; checked_limit_lb: number; heavy_limit_lb: number | null; carry_on_size: string | null; source_url: string | null; verified_at: string | null }>(
    `SELECT b.airline_code, a.name, b.checked_limit_lb, b.heavy_limit_lb, b.carry_on_size, b.source_url, to_char(b.verified_at,'YYYY-MM-DD') verified_at
     FROM baggage_rules b JOIN airlines a ON a.code = b.airline_code WHERE b.airline_code = $1 AND b.cabin = $2`, [airlineCode, cabin]);
  const r = rows[0];
  if (!r) return null;
  return { airlineCode: r.airline_code, airlineName: r.name, checkedLimitLb: r.checked_limit_lb, heavyLimitLb: r.heavy_limit_lb, carryOnSize: r.carry_on_size, sourceUrl: r.source_url, verifiedAt: r.verified_at };
}
export type BaggageRule = NonNullable<Awaited<ReturnType<typeof baggageRule>>>;
