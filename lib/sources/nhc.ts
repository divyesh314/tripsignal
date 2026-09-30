// NOAA National Hurricane Center active storms (free, no key).
import { cached } from "../mongo";
import { haversineKm } from "../geo";
import type { Signal, SourceContext, SourceResult } from "../types";
import { getJson, sourceMode } from "./http";
import { mockNhc } from "./mocks";

type Storm = { name: string; classification: string; intensity?: string; latitudeNumeric: number; longitudeNumeric: number; publicAdvisory?: { url?: string } };
type NhcResponse = { activeStorms: Storm[] };

const KIND: Record<string, string> = { HU: "Hurricane", TS: "Tropical Storm", TD: "Tropical Depression", STS: "Subtropical Storm", PTC: "Potential Tropical Cyclone" };

export function parseNhc(resp: NhcResponse, ctx: SourceContext, fetchedAt: Date): Signal[] {
  const out: Signal[] = [];
  for (const storm of resp.activeStorms ?? []) {
    for (const stop of ctx.stops) {
      const km = haversineKm(stop.airport, { lat: storm.latitudeNumeric, lon: storm.longitudeNumeric });
      const strong = storm.classification === "HU";
      const tropical = strong || storm.classification === "TS";
      let p = 0;
      if (km <= 300) p = strong ? 0.75 : tropical ? 0.55 : 0.25;
      else if (km <= 700) p = strong ? 0.35 : tropical ? 0.2 : 0.08;
      if (p === 0) continue;
      const kind = KIND[storm.classification] ?? "Tropical system";
      out.push({
        source: "nhc", sourceLabel: "National Hurricane Center", airport: stop.airport.iata, kind: "tropical", probability: p,
        text: `${kind} ${storm.name} is about ${Math.round(km)} km from ${stop.airport.city}.`,
        observedAt: fetchedAt.toISOString(), url: storm.publicAdvisory?.url ?? "https://www.nhc.noaa.gov/",
      });
    }
  }
  return out;
}

export async function fetchNhc(ctx: SourceContext): Promise<SourceResult> {
  const label = "National Hurricane Center";
  const days = (new Date(ctx.stops[0].windowStartUtc).getTime() - ctx.now.getTime()) / 86_400_000;
  if (days > 5) return { status: { source: "nhc", label, ok: true, applicable: false, note: "Storm tracks are checked within 5 days of travel." }, signals: [] };
  const res = await cached("nhc:current", "nhc", 30 * 60, () =>
    sourceMode() === "mock" ? Promise.resolve(mockNhc() as NhcResponse) : getJson<NhcResponse>("https://www.nhc.noaa.gov/CurrentStorms.json"),
  );
  return { status: { source: "nhc", label, ok: true, applicable: true, fetchedAt: res.fetchedAt.toISOString(), fromCache: res.fromCache }, signals: parseNhc(res.value, ctx, res.fetchedAt) };
}
