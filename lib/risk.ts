import { fetchFaa } from "./sources/faa";
import { fetchGdelt } from "./sources/gdelt";
import { fetchHolidays } from "./sources/holidays";
import { fetchNhc } from "./sources/nhc";
import { fetchNws } from "./sources/nws";
import { fetchOpenMeteo } from "./sources/openmeteo";
import { levelFor, type Assessment, type Level, type Signal, type SourceContext, type SourceResult, type SourceStatus, type StopScore } from "./types";

type Fetcher = { id: string; label: string; run: (ctx: SourceContext) => Promise<SourceResult> };

export const FETCHERS: Fetcher[] = [
  { id: "nws", label: "NWS weather alerts", run: fetchNws },
  { id: "open-meteo", label: "Open-Meteo forecast", run: fetchOpenMeteo },
  { id: "faa", label: "FAA airport status", run: fetchFaa },
  { id: "nhc", label: "National Hurricane Center", run: fetchNhc },
  { id: "gdelt", label: "News (GDELT)", run: fetchGdelt },
  { id: "holidays", label: "US public holidays", run: fetchHolidays },
];

/** Signals we can work out from the trip itself, with no external data. */
export function derivedSignals(ctx: SourceContext): Signal[] {
  const out: Signal[] = [];
  for (const s of ctx.stops) {
    if (s.role !== "connection" || s.layoverMin == null) continue;
    const base = { source: "trip", sourceLabel: "Your itinerary", airport: s.airport.iata, kind: "connection", observedAt: ctx.now.toISOString() };
    if (s.layoverMin < 45) out.push({ ...base, probability: 0.25, text: `Only about ${s.layoverMin} min to connect at ${s.airport.iata}. A small delay could mean a missed flight.` });
    else if (s.layoverMin < 60) out.push({ ...base, probability: 0.15, text: `About ${s.layoverMin} min to connect at ${s.airport.iata}, which is tight.` });
  }
  return out;
}

/** Independent risks at one airport: P(any) = 1 - Π(1 - p). */
export function combine(ps: number[]): number {
  const p = 1 - ps.reduce((acc, x) => acc * (1 - Math.max(0, Math.min(1, x))), 1);
  return Math.min(0.99, Math.round(p * 100) / 100);
}

export async function runSources(ctx: SourceContext): Promise<{ signals: Signal[]; sources: SourceStatus[] }> {
  const settled = await Promise.allSettled(FETCHERS.map((f) => f.run(ctx)));
  const signals: Signal[] = [];
  const sources: SourceStatus[] = [];
  settled.forEach((r, i) => {
    const f = FETCHERS[i];
    if (r.status === "fulfilled") {
      signals.push(...r.value.signals);
      sources.push(r.value.status);
    } else {
      // A failed source is reported, never silently treated as "all clear".
      sources.push({ source: f.id, label: f.label, ok: false, applicable: true, error: (r.reason as Error)?.message ?? String(r.reason) });
    }
  });
  return { signals, sources };
}

export function score(ctx: SourceContext, signals: Signal[], sources: SourceStatus[]): Assessment {
  const stops: StopScore[] = ctx.stops.map((stop) => {
    const mine = signals.filter((s) => s.airport === stop.airport.iata).sort((a, b) => b.probability - a.probability);
    const p = combine(mine.map((s) => s.probability));
    return {
      seq: stop.seq, iata: stop.airport.iata, role: stop.role, probability: p, level: levelFor(p),
      mainReason: mine[0]?.text ?? "No issues found.",
    };
  });

  // One bad airport is enough to break the whole trip, so the trip takes its worst stop.
  const worst = stops.reduce((a, b) => (b.probability > a.probability ? b : a));
  const weatherCovered = sources.some((s) => (s.source === "nws" || s.source === "open-meteo") && s.ok && s.applicable);
  const tooEarly = sources.filter((s) => s.source === "open-meteo").every((s) => s.ok && !s.applicable);

  let level: Level = levelFor(worst.probability);
  let headline: string;
  const pct = Math.round(worst.probability * 100);
  // Without weather data we can't claim "all clear". We still show orange/red if other
  // sources (e.g. an FAA ground stop) are enough on their own.
  if (!weatherCovered && level === "green") {
    level = "unknown";
    headline = tooEarly && signals.every((x) => x.source === "trip" || x.source === "bts" || x.source === "holidays")
      ? "Too early to forecast. We start checking 16 days before you fly."
      : "We couldn't reach our weather sources, so we can't give a signal right now.";
    stops.forEach((s) => { s.level = "unknown"; });
  } else if (level === "red") {
    headline = `${pct}% chance of disruption. Plan for a delay or a missed connection.`;
  } else if (level === "orange") {
    headline = `${pct}% chance of disruption. Possible, not certain. Keep an eye on it.`;
  } else {
    // green with weather coverage
    headline = `${pct}% chance of disruption. You're good to go.`;
  }
  if (!weatherCovered && (level === "orange" || level === "red")) headline += " Weather data is unavailable, so the real risk may be higher.";
  return { probability: worst.probability, level, headline, stops, signals: [...signals].sort((a, b) => b.probability - a.probability), sources };
}

export async function assess(ctx: SourceContext, extraSignals: Signal[] = []): Promise<Assessment> {
  const { signals, sources } = await runSources(ctx);
  return score(ctx, [...signals, ...derivedSignals(ctx), ...extraSignals], sources);
}
