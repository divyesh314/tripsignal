// Open-Meteo hourly forecast (free, no key). Covers up to 16 days ahead.
import { DateTime } from "luxon";
import { cached } from "../mongo";
import type { Signal, SourceContext, SourceResult, Stop } from "../types";
import { getJson, sourceMode } from "./http";
import { mockOpenMeteo } from "./mocks";

type Hourly = {
  time: string[]; wind_gusts_10m: (number | null)[]; visibility: (number | null)[]; precipitation: (number | null)[];
  snowfall: (number | null)[]; weather_code: (number | null)[]; temperature_2m: (number | null)[];
};
type OpenMeteoResponse = { hourly: Hourly };

const MAX_DAYS = 16;

export function parseOpenMeteo(resp: OpenMeteoResponse, stop: Stop, fetchedAt: Date): Signal[] {
  const h = resp.hourly;
  const ws = DateTime.fromISO(stop.windowStartUtc).startOf("hour");
  const we = DateTime.fromISO(stop.windowEndUtc);
  let maxGust = 0, minVis = Infinity, snow = 0, thunder = false, freezingPrecip = false, precip = 0;
  h.time.forEach((t, i) => {
    const time = DateTime.fromISO(t, { zone: "utc" });
    if (time < ws || time > we) return;
    maxGust = Math.max(maxGust, h.wind_gusts_10m[i] ?? 0);
    minVis = Math.min(minVis, h.visibility[i] ?? Infinity);
    snow += h.snowfall[i] ?? 0;
    precip += h.precipitation[i] ?? 0;
    const code = h.weather_code[i] ?? 0;
    if (code >= 95) thunder = true;
    if ((h.temperature_2m[i] ?? 10) <= 0 && (h.precipitation[i] ?? 0) > 0) freezingPrecip = true;
  });

  const a = stop.airport;
  const base = { source: "open-meteo", sourceLabel: `Open-Meteo forecast · ${a.city}`, airport: a.iata, observedAt: fetchedAt.toISOString() };
  const out: Signal[] = [];
  if (maxGust >= 50) out.push({ ...base, kind: "wind", probability: 0.5, text: `Gusts up to ${Math.round(maxGust)} mph forecast at ${a.iata} around your flight time.` });
  else if (maxGust >= 40) out.push({ ...base, kind: "wind", probability: 0.3, text: `Strong gusts of ${Math.round(maxGust)} mph forecast at ${a.iata}. Arrivals may be slowed.` });
  else if (maxGust >= 30) out.push({ ...base, kind: "wind", probability: 0.12, text: `Breezy at ${a.iata}, gusts near ${Math.round(maxGust)} mph.` });
  if (thunder) out.push({ ...base, kind: "thunderstorm", probability: 0.45, text: `Thunderstorms forecast at ${a.iata} during your window. Storms often cause ground stops.` });
  if (snow >= 2) out.push({ ...base, kind: "snow", probability: 0.5, text: `About ${snow.toFixed(1)} cm of snow forecast at ${a.iata}. Expect de-icing and slower operations.` });
  else if (snow > 0) out.push({ ...base, kind: "snow", probability: 0.2, text: `Light snow forecast at ${a.iata}.` });
  if (freezingPrecip && snow < 2) out.push({ ...base, kind: "deicing", probability: 0.25, text: `Precipitation near freezing at ${a.iata}: planes may need de-icing before departure.` });
  if (minVis < 400) out.push({ ...base, kind: "fog", probability: 0.35, text: `Very low visibility (under 400 m) forecast at ${a.iata}.` });
  else if (minVis < 1600) out.push({ ...base, kind: "fog", probability: 0.18, text: `Reduced visibility forecast at ${a.iata}, which can slow arrivals.` });
  if (!thunder && snow === 0 && precip >= 10) out.push({ ...base, kind: "rain", probability: 0.12, text: `Heavy rain (${precip.toFixed(0)} mm) forecast at ${a.iata}.` });
  return out;
}

export async function fetchOpenMeteo(ctx: SourceContext): Promise<SourceResult> {
  const label = "Open-Meteo forecast";
  const horizon = DateTime.fromJSDate(ctx.now).plus({ days: MAX_DAYS });
  const relevant = ctx.stops.filter((s) => DateTime.fromISO(s.windowEndUtc) <= horizon && DateTime.fromISO(s.windowEndUtc) >= DateTime.fromJSDate(ctx.now));
  if (relevant.length === 0) {
    return { status: { source: "open-meteo", label, ok: true, applicable: false, note: `Forecasts start ${MAX_DAYS} days before travel.` }, signals: [] };
  }
  const signals: Signal[] = [];
  let lastFetch: Date | undefined, anyFresh = false;
  for (const stop of relevant) {
    const startDate = DateTime.fromISO(stop.windowStartUtc, { zone: "utc" }).toISODate()!;
    const endDate = DateTime.fromISO(stop.windowEndUtc, { zone: "utc" }).toISODate()!;
    const { lat, lon } = stop.airport;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=wind_gusts_10m,visibility,precipitation,snowfall,weather_code,temperature_2m` +
      `&wind_speed_unit=mph&timezone=GMT&start_date=${startDate}&end_date=${endDate}`;
    const res = await cached(`open-meteo:${lat},${lon}:${startDate}:${endDate}`, "open-meteo", 60 * 60, () =>
      sourceMode() === "mock"
        ? Promise.resolve(mockOpenMeteo(stop, ctx, startDate, endDate) as OpenMeteoResponse)
        : getJson<OpenMeteoResponse>(url),
    );
    lastFetch = res.fetchedAt;
    anyFresh ||= !res.fromCache;
    signals.push(...parseOpenMeteo(res.value, stop, res.fetchedAt));
  }
  return { status: { source: "open-meteo", label, ok: true, applicable: true, fetchedAt: lastFetch?.toISOString(), fromCache: !anyFresh }, signals };
}
