// US public holidays from Nager.Date (free, no key). Busy periods add a small amount of risk.
import { DateTime } from "luxon";
import { cached } from "../mongo";
import type { Signal, SourceContext, SourceResult } from "../types";
import { getJson, sourceMode } from "./http";
import { mockHolidays } from "./mocks";

type Holiday = { date: string; localName: string; name: string };

// Holidays that move lots of people; others (e.g. Columbus Day) barely change airport crowds.
const BUSY = ["Thanksgiving", "Christmas", "New Year", "Independence", "Memorial", "Labor Day"];

export function parseHolidays(list: Holiday[], ctx: SourceContext, fetchedAt: Date): Signal[] {
  const travel = DateTime.fromISO(ctx.legs[0].depDate);
  for (const h of list) {
    if (!BUSY.some((b) => h.name.includes(b))) continue;
    const diff = Math.abs(DateTime.fromISO(h.date).diff(travel, "days").days);
    if (diff <= 2) {
      return [{
        source: "holidays", sourceLabel: "US public holidays", airport: ctx.stops[0].airport.iata, kind: "holiday", probability: 0.1,
        text: `You're flying ${diff === 0 ? "on" : "close to"} ${h.name}. Airports will be busy and rebooking options thin.`,
        observedAt: fetchedAt.toISOString(),
      }];
    }
  }
  return [];
}

export async function fetchHolidays(ctx: SourceContext): Promise<SourceResult> {
  const year = DateTime.fromISO(ctx.legs[0].depDate).year;
  const res = await cached(`holidays:${year}`, "holidays", 7 * 24 * 3600, () =>
    sourceMode() === "mock" ? Promise.resolve(mockHolidays(year) as Holiday[]) : getJson<Holiday[]>(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`),
  );
  return { status: { source: "holidays", label: "US public holidays", ok: true, applicable: true, fetchedAt: res.fetchedAt.toISOString(), fromCache: res.fromCache }, signals: parseHolidays(res.value, ctx, res.fetchedAt) };
}
