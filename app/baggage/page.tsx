import Link from "next/link";
import { BagChecker } from "@/components/BagChecker";
import { Icon } from "@/components/Icon";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { baggageRule, listAirlines, loadTrip, type BaggageRule } from "@/lib/trips";

export const dynamic = "force-dynamic";

export default async function BaggagePage({ searchParams }: { searchParams: Promise<{ trip?: string; airline?: string }> }) {
  const user = await currentUser();
  const sp = await searchParams;
  let tripId = Number(sp.trip);
  // No trip given: use the user's most recent one.
  if (!Number.isInteger(tripId) && user) {
    const rows = await query<{ id: string }>("SELECT id FROM trips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [user.userId]);
    tripId = rows[0] ? Number(rows[0].id) : NaN;
  }
  const trip = user && Number.isInteger(tripId) ? await loadTrip(tripId, user.userId) : null;

  const codes = trip ? [...new Set(trip.legs.map((l) => l.airlineCode))] : [sp.airline?.toUpperCase() || "UA"];
  const rules = (await Promise.all(codes.map((c) => baggageRule(c)))).filter(Boolean) as BaggageRule[];
  // Different airlines on one trip: the strictest limit wins.
  const strictest = rules.reduce<BaggageRule | null>((a, r) => (!a || r.checkedLimitLb < a.checkedLimitLb ? r : a), null);
  const airlines = await listAirlines();
  const origin = trip?.stops[0].airport;

  return (
    <div className="page">
      <Nav active="bags" />
      <main className="main">
        <div className="crumb">
          {origin ? `Departing ${origin.name} (${origin.iata})` : "Baggage"} · {rules.map((r) => r.airlineName).join(" + ") || "Choose an airline"} · Economy
        </div>
        <h1 className="h1" style={{ marginTop: 6 }}>Pack to the limit, not over it.</h1>
        <p className="lede" style={{ maxWidth: 720 }}>Limits come from your airline and fare, not the airport. Confirm on your booking before you fly.</p>

        {!trip && (
          <form className="card" style={{ marginTop: 20, padding: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", maxWidth: 520 }}>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label htmlFor="airline" className="label">Airline</label>
              <select id="airline" name="airline" className="input" defaultValue={codes[0]}>
                {airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </select>
            </div>
            <button className="btn btn-outline" type="submit">Show limits</button>
          </form>
        )}

        {!strictest ? (
          <p className="note note-orange" style={{ marginTop: 24 }}>We don't have baggage rules for this airline yet.</p>
        ) : (
          <div className="row" style={{ marginTop: 32 }}>
            <section className="col-half card" style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16 }}>
              <h2 className="h2" style={{ margin: 0 }}>Weigh your checked bag</h2>
              <BagChecker limitLb={strictest.checkedLimitLb} heavyLb={strictest.heavyLimitLb ?? 70} />
            </section>
            <section className="col-half" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: "6px 24px" }}>
                {[
                  { icon: "bag" as const, t: "Checked bag", s: `Up to ${strictest.checkedLimitLb} lb (${Math.round(strictest.checkedLimitLb * 0.4536)} kg) on ${strictest.airlineName} economy` },
                  { icon: "carryon" as const, t: "Carry-on", s: strictest.carryOnSize ? `Must fit ${strictest.carryOnSize} and the overhead bin` : "Must fit the overhead bin" },
                  { icon: "personal" as const, t: "Personal item", s: "Must fit under the seat in front" },
                ].map((r, i) => (
                  <div key={r.t} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0", borderBottom: i < 2 ? "1px solid var(--line-soft)" : undefined }}>
                    <Icon name={r.icon} size={24} stroke={1.7} />
                    <div><div style={{ fontWeight: 600, fontSize: 16 }}>{r.t}</div><div style={{ fontSize: 14, color: "var(--muted)" }}>{r.s}</div></div>
                  </div>
                ))}
              </div>
              {rules.length > 1 && (
                <div className="note note-orange">
                  <Icon name="warn" color="#8a4500" style={{ marginTop: 2 }} />
                  <div>Your trip uses {rules.map((r) => r.airlineName).join(" and ")}. We show the strictest limit so you're safe on every flight.</div>
                </div>
              )}
              {!strictest.verifiedAt && strictest.sourceUrl && (
                <div className="note note-blue">
                  <Icon name="warn" color="var(--blue)" style={{ marginTop: 2 }} />
                  <div>Limits change. <a href={strictest.sourceUrl} target="_blank" rel="noopener noreferrer">Check {strictest.airlineName}&apos;s baggage page</a> for your exact fare.</div>
                </div>
              )}
              {trip && <Link href={`/trips/${trip.id}`} className="btn btn-ink btn-lg" style={{ height: 52 }}>Back to my trip signal</Link>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
