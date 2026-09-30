export type Level = "green" | "orange" | "red" | "unknown";

/** Thresholds for the trip signal (probability of disruption, 0..1). */
export const THRESHOLDS = { orange: 0.4, red: 0.85 } as const;
export const ENGINE_VERSION = "rules-2026.09";

export function levelFor(p: number): Exclude<Level, "unknown"> {
  if (p >= THRESHOLDS.red) return "red";
  if (p >= THRESHOLDS.orange) return "orange";
  return "green";
}

export type StopRole = "departure" | "connection" | "destination";

export type Airport = {
  iata: string;
  name: string;
  city: string;
  state: string | null;
  lat: number;
  lon: number;
  timezone: string;
};

export type Leg = {
  seq: number;
  airlineCode: string;
  airlineName: string;
  flightNo: string | null;
  origin: Airport;
  dest: Airport;
  depDate: string; // yyyy-mm-dd, local at origin
  depTime: string; // HH:mm, local at origin
};

export type Stop = {
  seq: number;
  airport: Airport;
  role: StopRole;
  arriveUtc: string | null;  // estimated
  departUtc: string | null;
  layoverMin: number | null; // connections only
  windowStartUtc: string;    // time range we care about at this airport
  windowEndUtc: string;
};

export type Signal = {
  source: string;        // machine id, e.g. "nws"
  sourceLabel: string;   // shown to users, e.g. "NWS Wind Advisory · Denver"
  airport: string;       // IATA
  kind: string;          // wind | thunderstorm | snow | ground_stop | news | ...
  probability: number;   // 0..1 chance this alone disrupts the trip
  text: string;          // plain-English evidence
  observedAt: string;    // ISO time the source published / we fetched
  url?: string;
};

export type SourceStatus = {
  source: string;
  label: string;
  ok: boolean;
  applicable: boolean;   // false = not relevant for this date (e.g. live FAA data for a trip next week)
  note?: string;
  error?: string;
  fetchedAt?: string;
  fromCache?: boolean;
};

export type SourceContext = {
  stops: Stop[];
  legs: Leg[];
  now: Date;
};

export type SourceResult = { status: SourceStatus; signals: Signal[] };

export type StopScore = {
  seq: number;
  iata: string;
  role: StopRole;
  probability: number;
  level: Level;
  mainReason: string;
};

export type Assessment = {
  probability: number;
  level: Level;
  headline: string;
  stops: StopScore[];
  signals: Signal[];
  sources: SourceStatus[];
};
