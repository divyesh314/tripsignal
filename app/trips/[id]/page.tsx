import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { Icon } from "@/components/Icon";
import { Nav } from "@/components/Nav";
import { AlertsToggle, CheckAgainButton, RedOptionsButton, TimeAgo } from "@/components/ResultControls";
import { Meter, Pill, SignalCard } from "@/components/Signal";
import { actionsFor, redOptions, signalTone, stopTimes, type Action } from "@/lib/actions";
import { currentUser } from "@/lib/auth";
import { latestAssessment, loadTrip, runCheck } from "@/lib/trips";

export const dynamic = "force-dynamic";

function ActionRow({ a }: { a: Action }) {
  const cls = `action${a.kind === "primary" ? " primary" : a.kind === "danger" ? " danger" : ""}`;
  const body = (
    <>
      <Icon name={a.icon} size={22} />
      <div style={{ flexGrow: 1 }}>
        <div className="action-title">{a.title}</div>
        <div className="action-sub">{a.text}</div>
      </div>
    </>
  );
  // Tips (no link) render as plain cards so they don't look clickable.
  if (a.href.startsWith("#")) return <div className={cls} style={{ cursor: "default", borderColor: "var(--line)" }}>{body}</div>;
  if (a.external) {
    return (
      <a className={cls} href={a.href} target="_blank" rel="noopener noreferrer">
        {body}<Icon name="external" size={18} stroke={2} /><span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <Link className={cls} href={a.href}>{body}<Icon name="chevron" size={18} stroke={2} /></Link>;
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const id = Number((await params).id);
  if (!user || !Number.isInteger(id)) notFound();
  const trip = await loadTrip(id, user.userId);
  if (!trip) notFound();
  let a = await latestAssessment(id);
  if (!a) a = (await runCheck(id)).assessment;

  const cities = trip.stops.map((s) => s.airport.city).join(" → ");
  const flights = trip.legs.map((l) => l.flightNo || l.airlineName).join(" + ");
  const date = DateTime.fromISO(trip.legs[0].depDate).toFormat("cccc d LLL yyyy");
  const top = a.signals[0];
  const sub = a.level === "unknown"
    ? "We'll fill this in once forecasts cover your travel date."
    : top ? `Main risk: ${top.text}` : "Low risk at every airport on your route.";
  const actions = actionsFor(a.level, trip, a);
  const airportCodes = trip.stops.map((s) => s.airport.iata).join(", ");

  const alertText = a.level === "red" ? "We'll keep checking and tell you the moment this improves."
    : a.level === "orange" ? "We'll alert you if this reaches 85% and show your options."
    : "We'll alert you if anything changes before you board.";

  return (
    <div className="page">
      <Nav active="trips" />
      <main className="main">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="crumb"><Link href="/trips">My trips</Link> / Trip signal</div>
            <h1 className="h1 h1-sm" style={{ marginTop: 6 }}>{cities}</h1>
            <div className="meta" style={{ marginTop: 6 }}>{date} · {flights} · <TimeAgo iso={a.checkedAt} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/plan" className="btn btn-outline">New trip</Link>
            <CheckAgainButton tripId={trip.id} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 28 }}>
          <section className="col-5">
            <SignalCard level={a.level} headline={a.headline} />
            <Meter probability={a.probability} level={a.level} sub={sub} />
            {a.level === "red" && (
              <RedOptionsButton
                options={redOptions(trip, a)}
                title={`Your trip through ${[...a.stops].sort((x, y) => y.probability - x.probability)[0].iata} will likely be disrupted`}
                subtitle={`${Math.round(a.probability * 100)}% chance of disruption · ${a.stops.find((s) => s.level === "red")?.mainReason ?? a.headline}`}
                shareText={`Heads up: my flight ${trip.stops[0].airport.iata} → ${trip.stops[trip.stops.length - 1].airport.iata} on ${date} may be delayed. I'll keep you posted.`}
              />
            )}
            <div>
              <h2 className="h2">{a.level === "green" ? "Before you go" : a.level === "red" ? "Also useful" : "What you can do"}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {actions.map((x) => <ActionRow key={x.title} a={x} />)}
              </div>
            </div>
            <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 14, lineHeight: 1.45 }}>{alertText}</div>
              <AlertsToggle tripId={trip.id} initial={trip.alertsEnabled} />
            </div>
          </section>

          <section className="col-7">
            <div>
              <h2 className="h2">Your route</h2>
              <div className="stops">
                {trip.stops.map((s) => {
                  const score = a!.stops.find((x) => x.seq === s.seq);
                  const level = score?.level ?? "unknown";
                  return (
                    <div key={s.seq} className={`stop ${level}`}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div className="stop-code">{s.airport.iata}</div>
                        <Pill level={level} />
                      </div>
                      <div style={{ fontSize: 14, color: "var(--muted)" }}>{s.airport.city}</div>
                      <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>{stopTimes(s)}</div>
                      <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.45 }}>{score?.mainReason ?? "Not checked yet."}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ padding: "22px 24px 8px" }}>
              <h2 className="h2" style={{ marginBottom: 4 }}>Why we say this</h2>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--muted)" }}>Every signal is backed by a source you can check.</p>
              {a.signals.map((s, i) => (
                <div key={i} className="evidence">
                  <span className={`dot ${signalTone(s)}`} style={{ marginTop: 6 }} />
                  <div>
                    <div style={{ fontSize: 15, lineHeight: 1.45 }}>{s.text}</div>
                    <div className="mono" style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>
                      {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted)" }}>{s.sourceLabel}</a> : s.sourceLabel}
                      {" · "}{Math.round(s.probability * 100)}% on its own
                    </div>
                  </div>
                </div>
              ))}
              {a.sources.map((src) => {
                const hasSignals = a!.signals.some((s) => s.source === src.source);
                if (hasSignals) return null;
                const text = !src.ok ? `Couldn't reach ${src.label}. ${src.error ?? ""}`.trim()
                  : !src.applicable ? `${src.label}: ${src.note}`
                  : src.source === "nws" ? `No weather alerts at ${airportCodes} for your travel window.`
                  : src.source === "open-meteo" ? "No strong wind, storms, snow or fog in the forecast for your airports."
                  : src.source === "faa" ? "No ground stops or delay programs at any of your airports."
                  : src.source === "nhc" ? "No tropical storms near your route."
                  : src.source === "gdelt" ? "No news of strikes, outages or closures for your airports or airline."
                  : src.source === "holidays" ? "Not a peak holiday travel period."
                  : `${src.label}: nothing found.`;
                const tone = !src.ok || !src.applicable ? "info" : "green";
                return (
                  <div key={src.source} className="evidence">
                    <span className={`dot ${tone}`} style={{ marginTop: 6 }} />
                    <div>
                      <div style={{ fontSize: 15, lineHeight: 1.45, color: tone === "info" ? "var(--muted)" : undefined }}>{text}</div>
                      <div className="mono" style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>
                        {src.label}{src.fromCache ? " · cached" : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
