import { DateTime } from "luxon";
import type { IconName } from "@/components/Icon";
import type { StoredAssessment, TripRecord } from "./trips";
import type { Level, Signal, Stop } from "./types";

export type Action = { icon: IconName; title: string; text: string; href: string; external?: boolean; kind?: "primary" | "danger" | "share" };

function localTime(iso: string, tz: string) {
  return DateTime.fromISO(iso).setZone(tz);
}

function flightsUrl(from: string, to: string, date: string) {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from} to ${to} on ${date}`)}`;
}

function worstStop(trip: TripRecord, a: StoredAssessment): Stop {
  const worst = [...a.stops].sort((x, y) => y.probability - x.probability)[0];
  return trip.stops.find((s) => s.seq === worst?.seq) ?? trip.stops[0];
}

/** Suggestions shown under the signal. */
export function actionsFor(level: Level, trip: TripRecord, a: StoredAssessment): Action[] {
  const first = trip.stops[0];
  const baggage: Action = { icon: "bag", title: "Check your bag weight", text: "See your airline's limits before you pack.", href: `/baggage?trip=${trip.id}` };
  if (level === "unknown") {
    return [{ icon: "clock", title: "Check again closer to the day", text: "Forecasts start 16 days out; live airport status on the day you fly.", href: "#recheck" }, baggage];
  }
  if (level === "green") {
    const at = localTime(first.departUtc!, first.airport.timezone).minus({ hours: 2 });
    return [
      { icon: "clock", title: `Be at ${first.airport.iata} by ${at.toFormat("h:mm a")}`, text: "Two hours before departure leaves room for traffic and security.", href: "#" },
      baggage,
    ];
  }
  const out: Action[] = [];
  const tight = a.signals.find((s) => s.kind === "connection");
  const conn = trip.stops.find((s) => s.role === "connection");
  if (tight && conn) out.push({ icon: "clock", title: `Your ${conn.layoverMin} min connection is tight`, text: "Sit near the front and head straight to your next gate.", href: "#" });
  const w = worstStop(trip, a);
  const dest = trip.stops[trip.stops.length - 1];
  if (w.airport.iata !== dest.airport.iata) {
    const legFrom = trip.legs.find((l) => l.origin.iata === w.airport.iata) ?? trip.legs[0];
    out.push({ icon: "swap", title: `See other ${w.airport.iata} → ${dest.airport.iata} flights`, text: "Options that give you more buffer.", href: flightsUrl(w.airport.iata, dest.airport.iata, legFrom.depDate), external: true });
  }
  out.push(baggage);
  return out;
}

/** The options in the red-alert popup. */
export function redOptions(trip: TripRecord, a: StoredAssessment): Action[] {
  const dest = trip.stops[trip.stops.length - 1];
  const w = worstStop(trip, a);
  const loungeAt = w.airport.iata === dest.airport.iata ? trip.stops[0] : w;
  const legFrom = trip.legs.find((l) => l.origin.iata === w.airport.iata) ?? trip.legs[0];
  const uber = `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${dest.airport.lat}&pickup[longitude]=${dest.airport.lon}` +
    `&pickup[nickname]=${encodeURIComponent(`${dest.airport.iata} airport`)}`;
  return [
    { icon: "car", title: `Book your ${dest.airport.iata} pickup in advance`, text: "Schedule an Uber for when you land, before prices surge.", href: uber, external: true, kind: "primary" },
    { icon: "lounge", title: `Book a lounge at ${loungeAt.airport.city}`, text: "Wait out the delay somewhere quiet.", href: `https://www.google.com/search?q=${encodeURIComponent(`airport lounge day pass ${loungeAt.airport.iata}`)}`, external: true },
    { icon: "swap", title: `See later ${w.airport.iata} → ${dest.airport.iata} flights`, text: "Rebook with your airline before seats fill up.", href: flightsUrl(w.airport.iata, dest.airport.iata, legFrom.depDate), external: true },
    { icon: "share", title: "Share that you may be late", text: "Let whoever is meeting you know.", href: "#share", kind: "share" },
  ];
}

export function signalTone(s: Signal): "red" | "orange" | "green" | "info" {
  if (s.probability >= 0.6) return "red";
  if (s.probability >= 0.2) return "orange";
  return "info";
}

export function stopTimes(stop: Stop): string {
  const tz = stop.airport.timezone;
  const t = (iso: string) => DateTime.fromISO(iso).setZone(tz).toFormat("h:mm a ZZZZ");
  if (stop.role === "departure") return `Departs ${t(stop.departUtc!)}`;
  if (stop.role === "connection") return `Arrives ~${t(stop.arriveUtc!)} · ${stop.layoverMin} min connection`;
  return `Arrives ~${t(stop.arriveUtc!)} (estimated)`;
}
