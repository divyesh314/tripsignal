"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "./Icon";

type AirportOpt = { iata: string; label: string; city: string; name: string };
type LegState = { key: number; airlineCode: string; flightNo: string; from: string; to: string; depDate: string; depTime: string };

function tomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function codeOf(v: string): string {
  const m = /^\s*([A-Za-z]{3})\b/.exec(v);
  return m ? m[1].toUpperCase() : "";
}
function weekday(date: string): string {
  if (!date) return "";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

const CHECKS: { icon: IconName; title: string; text: string }[] = [
  { icon: "cloud", title: "Weather", text: "NWS alerts and forecasts at every airport" },
  { icon: "plane", title: "Airport status", text: "FAA ground stops and delay programs" },
  { icon: "news", title: "News", text: "Strikes, outages and closures" },
  { icon: "bag", title: "Baggage", text: "Your airline's weight limits" },
];

export function PlanForm({ airports, airlines }: { airports: AirportOpt[]; airlines: { code: string; name: string }[] }) {
  const router = useRouter();
  const [travelDate, setTravelDate] = useState(tomorrow);
  const [legs, setLegs] = useState<LegState[]>(() => [{ key: 1, airlineCode: "", flightNo: "", from: "", to: "", depDate: tomorrow(), depTime: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byCode = useMemo(() => new Map(airports.map((a) => [a.iata, a])), [airports]);
  const isDirect = legs.length === 1;

  const update = (key: number, patch: Partial<LegState>) =>
    setLegs((ls) => ls.map((l, i) => {
      if (l.key !== key) {
        // Keep connections chained: the next flight leaves from where this one lands.
        const prev = ls[i - 1];
        if (prev && prev.key === key && patch.to !== undefined) return { ...l, from: patch.to };
        return l;
      }
      return { ...l, ...patch };
    }));

  function addLeg() {
    setLegs((ls) => {
      if (ls.length >= 3) return ls;
      const prev = ls[ls.length - 1];
      return [...ls, { key: nextKey, airlineCode: prev.airlineCode, flightNo: "", from: prev.to, to: "", depDate: prev.depDate, depTime: "" }];
    });
    setNextKey((k) => k + 1);
  }
  const removeLeg = (key: number) => setLegs((ls) => ls.filter((l) => l.key !== key));

  function changeTravelDate(d: string) {
    setLegs((ls) => ls.map((l) => (l.depDate === travelDate ? { ...l, depDate: d } : l)));
    setTravelDate(d);
  }

  function fillExample() {
    const d = travelDate || tomorrow();
    const ord = byCode.get("ORD"), den = byCode.get("DEN"), lax = byCode.get("LAX");
    setLegs([
      { key: 1, airlineCode: "UA", flightNo: "UA 1142", from: ord?.label ?? "ORD", to: den?.label ?? "DEN", depDate: d, depTime: "07:15" },
      { key: 2, airlineCode: "UA", flightNo: "UA 588", from: den?.label ?? "DEN", to: lax?.label ?? "LAX", depDate: d, depTime: "09:35" },
    ]);
    setNextKey(3);
  }

  async function submit() {
    setError(null);
    const payload = legs.map((l, i) => ({
      airlineCode: l.airlineCode, flightNo: l.flightNo, origin: codeOf(l.from), dest: codeOf(l.to), depDate: l.depDate, depTime: l.depTime,
      _n: i + 1,
    }));
    for (const l of payload) {
      if (!l.airlineCode) return setError(`Flight ${l._n}: choose an airline.`);
      if (!byCode.has(l.origin)) return setError(`Flight ${l._n}: pick a departure airport from the list.`);
      if (!byCode.has(l.dest)) return setError(`Flight ${l._n}: pick a destination airport from the list.`);
      if (!l.depDate || !l.depTime) return setError(`Flight ${l._n}: add the departure day and time.`);
    }
    setBusy(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs: payload.map(({ _n, ...rest }) => rest) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't check this trip."); return; }
      router.push(`/trips/${data.tripId}`);
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const route = [codeOf(legs[0].from) || "—", ...legs.map((l) => codeOf(l.to) || "—")];

  return (
    <div className="row" style={{ marginTop: 32, gap: 28 }}>
      <datalist id="airport-list">
        {airports.map((a) => <option key={a.iata} value={a.label}>{a.name}</option>)}
      </datalist>

      <section className="col-3" aria-label="Flights">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <div className="field" style={{ gap: 6, flex: "1 1 220px" }}>
            <label htmlFor="tripdate" className="label label-lg">Travel date</label>
            <input id="tripdate" type="date" className="input input-lg" value={travelDate} onChange={(e) => changeTravelDate(e.target.value)} />
          </div>
          <div role="radiogroup" aria-label="Trip type" className="segmented">
            <button type="button" role="radio" aria-checked={isDirect} onClick={() => setLegs((ls) => ls.slice(0, 1))}>Direct</button>
            <button type="button" role="radio" aria-checked={!isDirect} onClick={() => { if (isDirect) addLeg(); }}>With connections</button>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column" }}>
          {legs.map((l, i) => (
            <div key={l.key} style={{ display: "flex", flexDirection: "column" }}>
              {i > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", color: "var(--muted)", fontSize: 14 }}>
                  <Icon name="clock" size={18} />
                  <span>Connection at <strong style={{ color: "var(--ink)" }}>{codeOf(l.from) ? `${byCode.get(codeOf(l.from))?.city ?? ""} (${codeOf(l.from)})` : "your connecting airport"}</strong></span>
                </div>
              )}
              <fieldset className="card" style={{ padding: 20, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <legend className="sr-only">{isDirect ? "Your flight" : `Flight ${i + 1}`}</legend>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
                  <div aria-hidden="true" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>{isDirect ? "Your flight" : `Flight ${i + 1}`}</div>
                  {i > 0 && <button type="button" className="link-danger" onClick={() => removeLeg(l.key)}>Remove</button>}
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label className="label" htmlFor={`airline-${l.key}`}>Airline</label>
                    <select id={`airline-${l.key}`} className="input" value={l.airlineCode} onChange={(e) => update(l.key, { airlineCode: e.target.value })}>
                      <option value="">Choose airline</option>
                      {airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`flight-${l.key}`}>Flight number</label>
                    <input id={`flight-${l.key}`} className="input mono" placeholder="e.g. UA 1142" value={l.flightNo} maxLength={10}
                      onChange={(e) => update(l.key, { flightNo: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`day-${l.key}`}>Day {l.depDate && <span style={{ fontWeight: 400 }}>· {weekday(l.depDate)}</span>}</label>
                    <input id={`day-${l.key}`} type="date" className="input" value={l.depDate} onChange={(e) => update(l.key, { depDate: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`from-${l.key}`}>From (pickup)</label>
                    <input id={`from-${l.key}`} className="input" list="airport-list" placeholder="City or airport code" value={l.from}
                      readOnly={i > 0} style={i > 0 ? { background: "#f3f5f7" } : undefined}
                      title={i > 0 ? "Connections leave from where the previous flight lands" : undefined}
                      onChange={(e) => update(l.key, { from: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`to-${l.key}`}>To</label>
                    <input id={`to-${l.key}`} className="input" list="airport-list" placeholder="City or airport code" value={l.to}
                      onChange={(e) => update(l.key, { to: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`time-${l.key}`}>Departs (local)</label>
                    <input id={`time-${l.key}`} type="time" className="input" value={l.depTime} onChange={(e) => update(l.key, { depTime: e.target.value })} />
                  </div>
                </div>
              </fieldset>
            </div>
          ))}
        </div>

        {legs.length < 3 && (
          <button type="button" className="btn-dashed" style={{ marginTop: 14 }} onClick={addLeg}>
            <Icon name="plus" size={18} stroke={2} /> Add connecting flight
          </button>
        )}
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted)" }}>
          {isDirect ? "Direct flight. You can add up to 2 connections." : `${legs.length - 1} of 2 connections added`}
          {" · "}
          <button type="button" onClick={fillExample} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", textDecoration: "underline", fontSize: 13 }}>
            Fill in an example trip
          </button>
        </p>
      </section>

      <aside className="col-2">
        <div className="dark-card">
          <div className="eyebrow">Your route</div>
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            {route.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700 }}>{c}</div>
                  <div style={{ fontSize: 12, color: "var(--on-ink-muted)" }}>{i === 0 ? "Departure" : i === route.length - 1 ? "Destination" : "Connection"}</div>
                </div>
                {i < route.length - 1 && <Icon name="arrow" color="#6f8199" stroke={2} />}
              </div>
            ))}
          </div>
          {error && <p role="alert" className="note note-red" style={{ margin: "18px 0 0", fontSize: 14, padding: "12px 14px" }}>{error}</p>}
          <button type="button" className="btn btn-go btn-lg" style={{ marginTop: 24 }} onClick={submit} disabled={busy}>
            {busy ? <><Icon name="spinner" className="spin" stroke={2} /> Checking your trip…</> : <>Check my trip <Icon name="arrow" stroke={2} /></>}
          </button>
        </div>
        <div className="card" style={{ padding: "20px 20px 8px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, marginBottom: 8 }}>What we check</div>
          {CHECKS.map((c) => (
            <div key={c.title} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid var(--line-soft)" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={c.icon} size={19} color="var(--blue)" />
              </div>
              <div><div style={{ fontWeight: 600, fontSize: 15 }}>{c.title}</div><div style={{ fontSize: 13, color: "var(--muted)" }}>{c.text}</div></div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
