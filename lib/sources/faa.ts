// FAA National Airspace System status (nasstatus.faa.gov). Free, no key, XML, live only.
import { XMLParser } from "fast-xml-parser";
import { cached } from "../mongo";
import type { Signal, SourceContext, SourceResult } from "../types";
import { getText, sourceMode } from "./http";
import { mockFaaXml } from "./mocks";

const URL_FAA = "https://nasstatus.faa.gov/api/airport-status-information";
const LIVE_WINDOW_HOURS = 12; // live status says little about a flight next week

export type FaaEvent = { airport: string; type: string; reason: string; detail: string };

function minutesFrom(text: string): number {
  const h = /(\d+)\s*hour/.exec(text);
  const m = /(\d+)\s*minute/.exec(text);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/** Walks the XML and returns every airport-level event with the delay type it sits under. */
export function parseFaaXml(xml: string): FaaEvent[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" }).parse(xml);
  const root = doc?.AIRPORT_STATUS_INFORMATION ?? {};
  const types = root.Delay_type ? (Array.isArray(root.Delay_type) ? root.Delay_type : [root.Delay_type]) : [];
  const events: FaaEvent[] = [];
  const walk = (node: unknown, typeName: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, typeName));
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.ARPT === "string") {
      const parts: string[] = [];
      if (obj.Avg) parts.push(`average delay ${obj.Avg}`);
      if (obj.Max && !obj.Avg) parts.push(`up to ${obj.Max}`);
      if (obj.End_Time) parts.push(`until ${obj.End_Time}`);
      if (obj.Reopen) parts.push(`reopens ${obj.Reopen}`);
      const ad = obj.Arrival_Departure as Record<string, unknown> | undefined;
      if (ad && (ad.Min || ad.Max)) parts.push(`${ad["@Type"] ?? "delays"} ${ad.Min ?? ""}–${ad.Max ?? ""}`.trim());
      events.push({ airport: obj.ARPT, type: typeName, reason: String(obj.Reason ?? "unspecified"), detail: parts.join(", ") });
      return;
    }
    for (const [k, v] of Object.entries(obj)) if (k !== "Name") walk(v, typeName);
  };
  for (const t of types) walk(t, String(t.Name ?? "Delay"));
  return events;
}

export function faaEventProbability(e: FaaEvent): number {
  const t = e.type.toLowerCase();
  if (t.includes("closure")) return 0.95;
  if (t.includes("ground stop")) return 0.85;
  if (t.includes("ground delay")) return minutesFrom(e.detail) >= 60 ? 0.7 : 0.55;
  if (t.includes("arrival") || t.includes("departure")) return 0.35;
  return 0.2;
}

export async function fetchFaa(ctx: SourceContext): Promise<SourceResult> {
  const label = "FAA airport status";
  const soon = ctx.stops.filter((s) => (new Date(s.windowStartUtc).getTime() - ctx.now.getTime()) / 3_600_000 <= LIVE_WINDOW_HOURS
    && new Date(s.windowEndUtc) >= ctx.now);
  if (soon.length === 0) {
    return { status: { source: "faa", label, ok: true, applicable: false, note: "Live airport status is checked on the day you fly." }, signals: [] };
  }
  const res = await cached("faa:nas", "faa", 5 * 60, () =>
    sourceMode() === "mock" ? Promise.resolve(mockFaaXml(ctx)) : getText(URL_FAA, { Accept: "application/xml" }),
  );
  const events = parseFaaXml(res.value);
  const signals: Signal[] = [];
  for (const stop of soon) {
    for (const e of events.filter((ev) => ev.airport === stop.airport.iata)) {
      signals.push({
        source: "faa",
        sourceLabel: "FAA NAS Status",
        airport: stop.airport.iata,
        kind: e.type.toLowerCase().includes("ground stop") ? "ground_stop" : "faa_delay",
        probability: faaEventProbability(e),
        text: `${e.type.replace(/s$/, "")} at ${stop.airport.city} (${stop.airport.iata})${e.detail ? `: ${e.detail}` : ""}, due to ${e.reason}.`,
        observedAt: res.fetchedAt.toISOString(),
        url: "https://nasstatus.faa.gov/",
      });
    }
  }
  return { status: { source: "faa", label, ok: true, applicable: true, fetchedAt: res.fetchedAt.toISOString(), fromCache: res.fromCache }, signals };
}
