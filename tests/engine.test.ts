import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStops, TripShapeError } from "../lib/geo";
import { combine, derivedSignals, score } from "../lib/risk";
import { faaEventProbability, parseFaaXml } from "../lib/sources/faa";
import { parseNws } from "../lib/sources/nws";
import { parseOpenMeteo } from "../lib/sources/openmeteo";
import { levelFor, type Airport, type Leg, type SourceStatus } from "../lib/types";

const ORD: Airport = { iata: "ORD", name: "Chicago O'Hare International", city: "Chicago", state: "IL", lat: 41.9742, lon: -87.9073, timezone: "America/Chicago" };
const DEN: Airport = { iata: "DEN", name: "Denver International", city: "Denver", state: "CO", lat: 39.8561, lon: -104.6737, timezone: "America/Denver" };
const LAX: Airport = { iata: "LAX", name: "Los Angeles International", city: "Los Angeles", state: "CA", lat: 33.9416, lon: -118.4085, timezone: "America/Los_Angeles" };

const leg = (seq: number, origin: Airport, dest: Airport, depTime: string, depDate = "2026-10-08"): Leg =>
  ({ seq, airlineCode: "UA", airlineName: "United Airlines", flightNo: null, origin, dest, depDate, depTime });

test("thresholds: under 40% green, 40-84% orange, 85%+ red", () => {
  assert.equal(levelFor(0.39), "green");
  assert.equal(levelFor(0.4), "orange");
  assert.equal(levelFor(0.84), "orange");
  assert.equal(levelFor(0.85), "red");
});

test("combine treats risks as independent", () => {
  assert.equal(combine([]), 0);
  assert.equal(combine([0.3, 0.3]), 0.51);
  assert.equal(combine([0.6, 0.5, 0.7]), 0.94);
  assert.equal(combine([1, 1]), 0.99); // never claims certainty
});

test("buildStops: departure, connection with layover, destination", () => {
  const stops = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:45")]);
  assert.deepEqual(stops.map((s) => [s.airport.iata, s.role]), [["ORD", "departure"], ["DEN", "connection"], ["LAX", "destination"]]);
  const den = stops[1];
  assert.ok(den.layoverMin! > 30 && den.layoverMin! < 90, `layover was ${den.layoverMin}`);
  assert.equal(stops[0].departUtc, "2026-10-08T12:15:00.000Z"); // 07:15 CDT
});

test("buildStops rejects a connection from the wrong airport", () => {
  assert.throws(() => buildStops([leg(1, ORD, DEN, "07:15"), leg(2, LAX, ORD, "12:00")]), TripShapeError);
});

test("buildStops rejects a connection that leaves before the first flight lands", () => {
  assert.throws(() => buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "07:30")]), /before flight 1/);
});

test("tight connection adds risk at the connecting airport", () => {
  const roomy = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:45")]);
  assert.equal(derivedSignals({ stops: roomy, legs: [], now: new Date() }).length, 0, "65 min is not tight");
  const stops = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:30")]);
  assert.equal(stops[1].layoverMin, 50);
  const sig = derivedSignals({ stops, legs: [], now: new Date("2026-10-07T12:00:00Z") });
  assert.equal(sig.length, 1);
  assert.equal(sig[0].airport, "DEN");
});

const FAA_XML = `<AIRPORT_STATUS_INFORMATION><Update_Time>Thu Oct 8 13:02:11 2026 GMT</Update_Time>
<Dtd_File>http://www.fly.faa.gov/AirportStatus.dtd</Dtd_File>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><listLength>1</listLength>
<Ground_Delay><ARPT>DEN</ARPT><Reason>wind</Reason><Avg>1 hour and 20 minutes</Avg><Max>2 hours</Max></Ground_Delay></Ground_Delay_List></Delay_type>
<Delay_type><Name>Ground Stops</Name><Ground_Stop_List><listLength>2</listLength>
<Program><ARPT>SFO</ARPT><Reason>low ceilings</Reason><End_Time>2:45 pm EDT</End_Time></Program>
<Program><ARPT>EWR</ARPT><Reason>thunderstorms</Reason><End_Time>3:00 pm EDT</End_Time></Program></Ground_Stop_List></Delay_type>
<Delay_type><Name>Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List><listLength>1</listLength>
<Delay><ARPT>ORD</ARPT><Reason>VOL:Volume</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay></Arrival_Departure_Delay_List></Delay_type>
<Delay_type><Name>Airport Closures</Name><Airport_Closure_List><listLength>1</listLength>
<Airport><ARPT>ANC</ARPT><Reason>!ANC 10/012 ANC AD AP CLSD</Reason><Start>Oct 08 at 12:00 UTC.</Start><Reopen>Oct 08 at 18:00 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type>
</AIRPORT_STATUS_INFORMATION>`;

test("parseFaaXml reads every delay type", () => {
  const ev = parseFaaXml(FAA_XML);
  assert.equal(ev.length, 5);
  const by = Object.fromEntries(ev.map((e) => [e.airport, e]));
  assert.equal(by.DEN.type, "Ground Delay Programs");
  assert.match(by.DEN.detail, /1 hour and 20 minutes/);
  assert.equal(by.SFO.type, "Ground Stops");
  assert.equal(by.ORD.type, "Arrival/Departure Delay Info");
  assert.match(by.ORD.detail, /Departure 16 minutes–30 minutes/);
  assert.equal(faaEventProbability(by.ANC), 0.95);
  assert.equal(faaEventProbability(by.SFO), 0.85);
  assert.equal(faaEventProbability(by.DEN), 0.7);
});

test("parseFaaXml handles a quiet day", () => {
  assert.deepEqual(parseFaaXml("<AIRPORT_STATUS_INFORMATION><Update_Time>x</Update_Time></AIRPORT_STATUS_INFORMATION>"), []);
});

test("parseNws keeps only alerts that overlap the stop's window", () => {
  const [, den] = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:45")]);
  const alert = (event: string, onset: string, ends: string) => ({ properties: { id: "https://api.weather.gov/alerts/x", event, severity: "Moderate", onset, ends } });
  const sig = parseNws({ features: [
    alert("Wind Advisory", "2026-10-08T12:00:00Z", "2026-10-08T20:00:00Z"),
    alert("Winter Storm Warning", "2026-10-09T12:00:00Z", "2026-10-09T20:00:00Z"),
  ] }, den, new Date());
  assert.equal(sig.length, 1);
  assert.equal(sig[0].kind, "wind");
  assert.equal(sig[0].probability, 0.3);
});

test("parseOpenMeteo flags strong gusts and thunderstorms in the window only", () => {
  const [, den] = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:45")]);
  const time: string[] = [];
  for (let h = 0; h < 24; h++) time.push(`2026-10-08T${String(h).padStart(2, "0")}:00`);
  const inWin = (t: string) => t >= den.windowStartUtc.slice(0, 13) && t <= den.windowEndUtc.slice(0, 16);
  const resp = { hourly: {
    time,
    wind_gusts_10m: time.map((t) => (inWin(t) ? 45 : 60)), // 60 outside the window must be ignored
    visibility: time.map(() => 20000), precipitation: time.map(() => 0), snowfall: time.map(() => 0),
    weather_code: time.map((t) => (inWin(t) ? 95 : 0)), temperature_2m: time.map(() => 15),
  } };
  const sig = parseOpenMeteo(resp, den, new Date());
  assert.deepEqual(sig.map((s) => [s.kind, s.probability]).sort(), [["thunderstorm", 0.45], ["wind", 0.3]]);
});

test("score: no weather coverage and no signals gives 'unknown', not green", () => {
  const stops = buildStops([leg(1, ORD, DEN, "07:15", "2027-03-01")]);
  const sources: SourceStatus[] = [
    { source: "nws", label: "NWS", ok: true, applicable: false },
    { source: "open-meteo", label: "Open-Meteo", ok: true, applicable: false, note: "too early" },
  ];
  const a = score({ stops, legs: [], now: new Date("2026-10-01T00:00:00Z") }, [], sources);
  assert.equal(a.level, "unknown");
  assert.match(a.headline, /Too early/);
});

test("score: all weather sources down gives 'unknown' with an honest message", () => {
  const stops = buildStops([leg(1, ORD, DEN, "07:15")]);
  const sources: SourceStatus[] = [
    { source: "nws", label: "NWS", ok: false, applicable: true, error: "timeout" },
    { source: "open-meteo", label: "Open-Meteo", ok: false, applicable: true, error: "timeout" },
  ];
  const a = score({ stops, legs: [], now: new Date("2026-10-07T00:00:00Z") }, [], sources);
  assert.equal(a.level, "unknown");
  assert.match(a.headline, /couldn't reach/);
});

test("score: trip takes its worst airport", () => {
  const stops = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:45")]);
  const s = (airport: string, probability: number) => ({ source: "x", sourceLabel: "x", airport, kind: "x", probability, text: `${airport} ${probability}`, observedAt: "" });
  const sources: SourceStatus[] = [{ source: "open-meteo", label: "Open-Meteo", ok: true, applicable: true }];
  const a = score({ stops, legs: [], now: new Date() }, [s("DEN", 0.6), s("DEN", 0.5), s("LAX", 0.2)], sources);
  assert.equal(a.probability, 0.8);
  assert.equal(a.level, "orange");
  assert.equal(a.stops.find((x) => x.iata === "DEN")!.level, "orange");
  assert.equal(a.stops.find((x) => x.iata === "ORD")!.level, "green");
});

test("score: weather down + a small itinerary risk is still 'unknown', never a false green", () => {
  const stops = buildStops([leg(1, ORD, DEN, "07:15"), leg(2, DEN, LAX, "09:30")]);
  const ctx = { stops, legs: [], now: new Date("2026-10-07T00:00:00Z") };
  const sources: SourceStatus[] = [
    { source: "nws", label: "NWS", ok: false, applicable: true, error: "HTTP 403" },
    { source: "open-meteo", label: "Open-Meteo", ok: false, applicable: true, error: "HTTP 403" },
  ];
  const a = score(ctx, derivedSignals(ctx), sources);
  assert.equal(a.level, "unknown");
  assert.match(a.headline, /couldn't reach/);
});

test("score: weather down but an FAA ground stop still shows red, with a warning", () => {
  const stops = buildStops([leg(1, ORD, DEN, "07:15")]);
  const sources: SourceStatus[] = [
    { source: "nws", label: "NWS", ok: false, applicable: true, error: "timeout" },
    { source: "open-meteo", label: "Open-Meteo", ok: false, applicable: true, error: "timeout" },
    { source: "faa", label: "FAA", ok: true, applicable: true },
  ];
  const gs = { source: "faa", sourceLabel: "FAA", airport: "DEN", kind: "ground_stop", probability: 0.85, text: "Ground stop", observedAt: "" };
  const a = score({ stops, legs: [], now: new Date() }, [gs], sources);
  assert.equal(a.level, "red");
  assert.match(a.headline, /Weather data is unavailable/);
});
