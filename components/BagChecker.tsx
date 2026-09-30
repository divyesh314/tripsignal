"use client";
import { useState } from "react";

export function BagChecker({ limitLb, heavyLb }: { limitLb: number; heavyLb: number }) {
  const [raw, setRaw] = useState("46");
  const w = Math.max(0, Number(raw) || 0);
  const tone = w <= limitLb ? "green" : w <= heavyLb ? "orange" : "red";
  const copy = {
    green: { title: "Within the limit", text: `${limitLb - w} lb to spare. No overweight fee.` },
    orange: { title: "Overweight fee likely", text: `${w - limitLb} lb over. Move items to your carry-on or expect a fee at the counter.` },
    red: { title: "Heavy bag: may be refused", text: `Over ${heavyLb} lb, many airlines charge much more or refuse the bag. Repack before you leave home.` },
  }[tone];
  const pct = Math.min(100, (w / heavyLb) * 100);
  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div className="field" style={{ flexGrow: 1, gap: 6 }}>
          <label htmlFor="bagweight" className="label label-lg">Bag weight (lb)</label>
          <input id="bagweight" type="number" min={0} inputMode="decimal" className="input mono" style={{ height: 56, fontSize: 22 }}
            value={raw} onChange={(e) => setRaw(e.target.value)} aria-describedby="bag-status" />
        </div>
        <div style={{ height: 56, display: "flex", alignItems: "center", fontSize: 15, color: "var(--muted)" }}>= {(w * 0.4536).toFixed(1)} kg</div>
      </div>
      <div id="bag-status" role="status" className={`note`} style={{ background: `var(--${tone}-bg)`, color: `var(--${tone}-fg)`, padding: "14px 16px" }}>
        <span className={`dot ${tone}`} style={{ width: 12, height: 12, borderRadius: 6, marginTop: 5 }} />
        <div><div style={{ fontWeight: 600, fontSize: 16 }}>{copy.title}</div><div style={{ fontSize: 14 }}>{copy.text}</div></div>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 6, background: "#e3e8ee", overflow: "hidden" }} aria-hidden="true">
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `var(--${tone})` }} />
      </div>
      <div className="mono" style={{ position: "relative", height: 16, fontSize: 12, color: "var(--muted)" }}>
        <span style={{ position: "absolute", left: 0 }}>0</span>
        <span style={{ position: "absolute", left: `${(limitLb / heavyLb) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{limitLb} lb limit</span>
        <span style={{ position: "absolute", right: 0 }}>{heavyLb} lb</span>
      </div>
    </>
  );
}
