// Sample payloads shaped exactly like the real APIs, used when SOURCE_MODE=mock.
// They go through the same parsers as live data, so mock mode still tests the parsing code.
import { DateTime } from "luxon";
import type { SourceContext, Stop } from "../types";

export type Scenario = "green" | "orange" | "red";

export function scenario(): Scenario {
  const s = process.env.MOCK_SCENARIO;
  return s === "green" || s === "red" ? s : "orange";
}

/** The airport that gets the bad weather: first connection, else the destination. */
export function targetStop(ctx: SourceContext): Stop {
  return ctx.stops.find((s) => s.role === "connection") ?? ctx.stops[ctx.stops.length - 1];
}

export function mockNws(stop: Stop, ctx: SourceContext) {
  const sc = scenario();
  if (sc === "green" || stop.airport.iata !== targetStop(ctx).airport.iata) return { features: [] };
  const onset = DateTime.fromISO(stop.windowStartUtc).minus({ hours: 2 }).toISO();
  const ends = DateTime.fromISO(stop.windowEndUtc).plus({ hours: 2 }).toISO();
  const warning = sc === "red";
  return {
    features: [{
      properties: {
        id: `https://api.weather.gov/alerts/mock-${stop.airport.iata}`,
        event: warning ? "High Wind Warning" : "Wind Advisory",
        severity: warning ? "Severe" : "Moderate",
        headline: warning ? "High Wind Warning issued with gusts up to 60 mph" : "Wind Advisory issued with gusts of 40 to 50 mph",
        description: "Sample alert for demo mode.",
        onset, effective: onset, ends, expires: ends,
        senderName: `NWS ${stop.airport.city}`,
        areaDesc: stop.airport.city,
      },
    }],
  };
}

export function mockOpenMeteo(stop: Stop, ctx: SourceContext, startDate: string, endDate: string) {
  const sc = scenario();
  const isTarget = stop.airport.iata === targetStop(ctx).airport.iata;
  const start = DateTime.fromISO(`${startDate}T00:00`, { zone: "utc" });
  const end = DateTime.fromISO(`${endDate}T23:00`, { zone: "utc" });
  const ws = DateTime.fromISO(stop.windowStartUtc);
  const we = DateTime.fromISO(stop.windowEndUtc);
  const time: string[] = [], gust: number[] = [], vis: number[] = [], precip: number[] = [], snow: number[] = [], code: number[] = [], temp: number[] = [];
  for (let t = start; t <= end; t = t.plus({ hours: 1 })) {
    const inWindow = t >= ws.startOf("hour") && t <= we;
    const windy = isTarget && inWindow && sc !== "green";
    time.push(t.toFormat("yyyy-MM-dd'T'HH:mm"));
    gust.push(windy ? (sc === "red" ? 58 : 45) : 14);
    vis.push(24000);
    precip.push(0);
    snow.push(0);
    code.push(windy ? 3 : 1);
    temp.push(16);
  }
  return {
    latitude: stop.airport.lat, longitude: stop.airport.lon,
    hourly: { time, wind_gusts_10m: gust, visibility: vis, precipitation: precip, snowfall: snow, weather_code: code, temperature_2m: temp },
  };
}

export function mockFaaXml(ctx: SourceContext): string {
  const now = DateTime.utc().toFormat("EEE MMM d HH:mm:ss yyyy 'GMT'");
  if (scenario() !== "red") {
    return `<AIRPORT_STATUS_INFORMATION><Update_Time>${now}</Update_Time></AIRPORT_STATUS_INFORMATION>`;
  }
  const t = targetStop(ctx).airport.iata;
  return `<AIRPORT_STATUS_INFORMATION><Update_Time>${now}</Update_Time>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><listLength>1</listLength>
<Ground_Delay><ARPT>${t}</ARPT><Reason>wind</Reason><Avg>1 hour and 20 minutes</Avg><Max>2 hours and 5 minutes</Max></Ground_Delay>
</Ground_Delay_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;
}

export function mockGdelt(ctx: SourceContext) {
  if (scenario() !== "red") return { articles: [] };
  const t = targetStop(ctx).airport;
  return {
    articles: [{
      url: "https://example.com/sample-news",
      title: `Flights cancelled at ${t.name} as high winds slow arrivals`,
      seendate: DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'"),
      domain: "example.com",
    }],
  };
}

export function mockNhc() {
  return { activeStorms: [] };
}

export function mockHolidays(year: number) {
  return [
    { date: `${year}-11-26`, localName: "Thanksgiving Day", name: "Thanksgiving Day", global: true },
    { date: `${year}-12-25`, localName: "Christmas Day", name: "Christmas Day", global: true },
  ];
}
