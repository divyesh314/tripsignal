import { DateTime } from "luxon";
import type { Airport, Leg, Stop } from "./types";

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough block time: cruise ~780 km/h plus 35 minutes for taxi, climb and descent.
 * We don't ask users for arrival times, so connections use this estimate.
 */
export function estimateFlightMinutes(from: Airport, to: Airport): number {
  const km = haversineKm(from, to);
  return Math.round(((km / 780) * 60 + 35) / 5) * 5;
}

export function departureLocal(leg: Leg): DateTime {
  return DateTime.fromISO(`${leg.depDate}T${leg.depTime}`, { zone: leg.origin.timezone });
}

export class TripShapeError extends Error {}

/** Turns 1–3 legs into the list of airports the traveller passes through. */
export function buildStops(legs: Leg[]): Stop[] {
  if (legs.length < 1 || legs.length > 3) throw new TripShapeError("A trip needs 1 to 3 flights.");
  const sorted = [...legs].sort((a, b) => a.seq - b.seq);
  const dep: DateTime[] = sorted.map(departureLocal);
  const arr: DateTime[] = sorted.map((l, i) => dep[i].plus({ minutes: estimateFlightMinutes(l.origin, l.dest) }));

  for (let i = 0; i < sorted.length; i++) {
    if (!dep[i].isValid) throw new TripShapeError(`Flight ${i + 1} has an invalid date or time.`);
    if (sorted[i].origin.iata === sorted[i].dest.iata) throw new TripShapeError(`Flight ${i + 1} starts and ends at the same airport.`);
    if (i > 0 && sorted[i].origin.iata !== sorted[i - 1].dest.iata) {
      throw new TripShapeError(`Flight ${i + 1} must leave from ${sorted[i - 1].dest.iata}, where flight ${i} lands.`);
    }
    if (i > 0 && dep[i] <= arr[i - 1]) {
      throw new TripShapeError(`Flight ${i + 1} departs before flight ${i} is expected to land. Check the times.`);
    }
  }

  const iso = (d: DateTime) => d.toUTC().toISO()!;
  const stops: Stop[] = [];
  stops.push({
    seq: 1, airport: sorted[0].origin, role: "departure", arriveUtc: null, departUtc: iso(dep[0]), layoverMin: null,
    windowStartUtc: iso(dep[0].minus({ hours: 2 })), windowEndUtc: iso(dep[0].plus({ hours: 1 })),
  });
  for (let i = 0; i < sorted.length - 1; i++) {
    stops.push({
      seq: stops.length + 1, airport: sorted[i].dest, role: "connection",
      arriveUtc: iso(arr[i]), departUtc: iso(dep[i + 1]),
      layoverMin: Math.round(dep[i + 1].diff(arr[i], "minutes").minutes),
      windowStartUtc: iso(arr[i].minus({ hours: 1 })), windowEndUtc: iso(dep[i + 1].plus({ hours: 1 })),
    });
  }
  const last = sorted.length - 1;
  stops.push({
    seq: stops.length + 1, airport: sorted[last].dest, role: "destination", arriveUtc: iso(arr[last]), departUtc: null, layoverMin: null,
    windowStartUtc: iso(arr[last].minus({ hours: 1 })), windowEndUtc: iso(arr[last].plus({ hours: 2 })),
  });
  return stops;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Hours from now until the start of the stop's window (negative = already started). */
export function hoursUntil(stop: Stop, now: Date): number {
  return (new Date(stop.windowStartUtc).getTime() - now.getTime()) / 3_600_000;
}

export function formatLocal(isoUtc: string | null, tz: string, fmt = "h:mm a ZZZZ"): string {
  if (!isoUtc) return "";
  return DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(tz).toFormat(fmt);
}
