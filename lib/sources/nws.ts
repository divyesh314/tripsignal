// National Weather Service active alerts (api.weather.gov). Free, no key; needs a User-Agent.
import { cached } from "../mongo";
import { overlaps } from "../geo";
import type { Signal, SourceContext, SourceResult, Stop } from "../types";
import { getJson, sourceMode } from "./http";
import { mockNws } from "./mocks";

type NwsFeature = {
  properties: {
    id: string; event: string; severity: string; headline?: string;
    onset?: string | null; effective?: string; ends?: string | null; expires?: string; senderName?: string;
  };
};
type NwsResponse = { features: NwsFeature[] };

// Chance each alert type disrupts air travel at that airport. Rule-based starting points;
// they would be calibrated against BTS delay history before real use.
const EVENT_PROBABILITY: Record<string, { p: number; kind: string }> = {
  "Hurricane Warning": { p: 0.9, kind: "hurricane" },
  "Hurricane Watch": { p: 0.5, kind: "hurricane" },
  "Tropical Storm Warning": { p: 0.75, kind: "tropical_storm" },
  "Tropical Storm Watch": { p: 0.4, kind: "tropical_storm" },
  "Blizzard Warning": { p: 0.9, kind: "snow" },
  "Ice Storm Warning": { p: 0.85, kind: "ice" },
  "Winter Storm Warning": { p: 0.7, kind: "snow" },
  "Winter Storm Watch": { p: 0.35, kind: "snow" },
  "Winter Weather Advisory": { p: 0.35, kind: "snow" },
  "Freezing Rain Advisory": { p: 0.45, kind: "ice" },
  "Tornado Warning": { p: 0.9, kind: "tornado" },
  "Tornado Watch": { p: 0.45, kind: "tornado" },
  "Severe Thunderstorm Warning": { p: 0.6, kind: "thunderstorm" },
  "Severe Thunderstorm Watch": { p: 0.35, kind: "thunderstorm" },
  "High Wind Warning": { p: 0.6, kind: "wind" },
  "High Wind Watch": { p: 0.3, kind: "wind" },
  "Wind Advisory": { p: 0.3, kind: "wind" },
  "Dense Fog Advisory": { p: 0.35, kind: "fog" },
  "Dust Storm Warning": { p: 0.5, kind: "dust" },
  "Blowing Dust Advisory": { p: 0.25, kind: "dust" },
  "Flash Flood Warning": { p: 0.35, kind: "flood" },
  "Flood Warning": { p: 0.2, kind: "flood" },
  "Extreme Heat Warning": { p: 0.15, kind: "heat" },
  "Excessive Heat Warning": { p: 0.15, kind: "heat" },
  "Red Flag Warning": { p: 0.05, kind: "fire_weather" },
};
const SEVERITY_FALLBACK: Record<string, number> = { Extreme: 0.6, Severe: 0.4, Moderate: 0.2, Minor: 0.08 };

export function parseNws(resp: NwsResponse, stop: Stop, fetchedAt: Date): Signal[] {
  const ws = new Date(stop.windowStartUtc), we = new Date(stop.windowEndUtc);
  const out: Signal[] = [];
  for (const f of resp.features ?? []) {
    const p = f.properties;
    const start = new Date(p.onset ?? p.effective ?? fetchedAt.toISOString());
    const end = new Date(p.ends ?? p.expires ?? start.getTime() + 6 * 3_600_000);
    if (!overlaps(start, end, ws, we)) continue;
    const mapped = EVENT_PROBABILITY[p.event];
    const probability = mapped?.p ?? SEVERITY_FALLBACK[p.severity] ?? 0.05;
    out.push({
      source: "nws",
      sourceLabel: `NWS ${p.event} · ${stop.airport.city}`,
      airport: stop.airport.iata,
      kind: mapped?.kind ?? "weather_alert",
      probability,
      text: p.headline ?? `${p.event} in effect near ${stop.airport.name}.`,
      observedAt: fetchedAt.toISOString(),
      url: p.id?.startsWith("http") ? p.id : undefined,
    });
  }
  return out;
}

export async function fetchNws(ctx: SourceContext): Promise<SourceResult> {
  const label = "NWS weather alerts";
  // Active alerts only describe the next ~2-3 days.
  const relevant = ctx.stops.filter((s) => (new Date(s.windowStartUtc).getTime() - ctx.now.getTime()) / 3_600_000 < 72);
  if (relevant.length === 0) {
    return { status: { source: "nws", label, ok: true, applicable: false, note: "Alerts are issued up to about 3 days ahead." }, signals: [] };
  }
  const ua = process.env.NWS_USER_AGENT || "TripSignal prototype";
  const signals: Signal[] = [];
  let lastFetch: Date | undefined, anyFresh = false;
  for (const stop of relevant) {
    const { lat, lon } = stop.airport;
    const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
    const res = await cached(`nws:${lat.toFixed(4)},${lon.toFixed(4)}`, "nws", 10 * 60, () =>
      sourceMode() === "mock"
        ? Promise.resolve(mockNws(stop, ctx) as NwsResponse)
        : getJson<NwsResponse>(url, { "User-Agent": ua, Accept: "application/geo+json" }),
    );
    lastFetch = res.fetchedAt;
    anyFresh ||= !res.fromCache;
    signals.push(...parseNws(res.value, stop, res.fetchedAt));
  }
  return { status: { source: "nws", label, ok: true, applicable: true, fetchedAt: lastFetch?.toISOString(), fromCache: !anyFresh }, signals };
}
