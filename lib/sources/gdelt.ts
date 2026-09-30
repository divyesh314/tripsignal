// GDELT news search (free, no key). Noisy, so it only ever adds a small amount of risk
// and is always labelled as unverified news.
import { cached } from "../mongo";
import type { Signal, SourceContext, SourceResult } from "../types";
import { getJson, sourceMode } from "./http";
import { mockGdelt } from "./mocks";

type Article = { url: string; title: string; seendate: string; domain: string };
type GdeltResponse = { articles?: Article[] };

const TERMS = '(strike OR outage OR "ground stop" OR cancellations OR cancelled OR evacuated OR closed)';

function shortName(name: string): string {
  // "Chicago O'Hare International" -> "O'Hare"; keeps queries specific but not too long
  return name.replace(/International|Airport|Metropolitan|Wayne County/g, "").replace(/^Chicago |^Newark /, "").trim();
}

export function parseGdelt(resp: GdeltResponse, ctx: SourceContext, fetchedAt: Date): Signal[] {
  const articles = resp.articles ?? [];
  const out: Signal[] = [];
  for (const stop of ctx.stops) {
    const key = shortName(stop.airport.name).toLowerCase();
    const hits = articles.filter((a) => a.title.toLowerCase().includes(key) || a.title.includes(stop.airport.iata));
    if (hits.length === 0) continue;
    out.push({
      source: "gdelt", sourceLabel: "News (unverified)", airport: stop.airport.iata, kind: "news",
      probability: Math.min(0.3, 0.1 + 0.05 * (hits.length - 1)),
      text: hits.length === 1 ? `News report: "${hits[0].title}"` : `${hits.length} news reports mention disruption at ${stop.airport.iata}, e.g. "${hits[0].title}"`,
      observedAt: fetchedAt.toISOString(), url: hits[0].url,
    });
  }
  const airlines = [...new Set(ctx.legs.map((l) => l.airlineName))];
  for (const airline of airlines) {
    const hits = articles.filter((a) => a.title.toLowerCase().includes(airline.toLowerCase()));
    if (hits.length === 0) continue;
    out.push({
      source: "gdelt", sourceLabel: "News (unverified)", airport: ctx.stops[0].airport.iata, kind: "airline_news",
      probability: 0.15, text: `News about ${airline}: "${hits[0].title}"`, observedAt: fetchedAt.toISOString(), url: hits[0].url,
    });
  }
  return out;
}

export async function fetchGdelt(ctx: SourceContext): Promise<SourceResult> {
  const label = "News (GDELT)";
  const days = (new Date(ctx.stops[0].windowStartUtc).getTime() - ctx.now.getTime()) / 86_400_000;
  if (days > 3) return { status: { source: "gdelt", label, ok: true, applicable: false, note: "News is checked within 3 days of travel." }, signals: [] };
  const names = ctx.stops.map((s) => `"${shortName(s.airport.name)}"`).concat([...new Set(ctx.legs.map((l) => `"${l.airlineName}"`))]);
  const q = `(${[...new Set(names)].join(" OR ")}) ${TERMS} sourcecountry:US`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=25&format=json&timespan=24h`;
  const res = await cached(`gdelt:${q}`, "gdelt", 30 * 60, () =>
    sourceMode() === "mock" ? Promise.resolve(mockGdelt(ctx) as GdeltResponse) : getJson<GdeltResponse>(url, {}, 10000),
  );
  return { status: { source: "gdelt", label, ok: true, applicable: true, fetchedAt: res.fetchedAt.toISOString(), fromCache: res.fromCache }, signals: parseGdelt(res.value, ctx, res.fetchedAt) };
}
