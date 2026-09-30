import type { Level } from "@/lib/types";
import { Icon, type IconName } from "./Icon";

export const LEVEL_ICON: Record<Level, IconName> = { green: "check", orange: "bang", red: "x", unknown: "question" };
const WORD: Record<Level, string> = { green: "Green light", orange: "Orange: watch", red: "Red: act now", unknown: "No signal yet" };
const SHORT: Record<Level, string> = { green: "Clear", orange: "Watch", red: "Act", unknown: "Unknown" };
const DARK_ON: Record<string, string> = { green: "var(--green)", orange: "var(--orange)", red: "var(--red)", unknown: "var(--muted)" };

export function SignalCard({ level, headline }: { level: Level; headline: string }) {
  const light = (l: "red" | "orange" | "green") => (
    <div className={`light light-${l}${level === l ? " on" : ""}`}>
      {level === l && <Icon name={LEVEL_ICON[l]} size={20} stroke={2.4} color="var(--ink-deep)" />}
    </div>
  );
  return (
    <section className="signal" aria-label="Trip signal">
      <div className="signal-housing" aria-hidden="true">{light("red")}{light("orange")}{light("green")}</div>
      <div style={{ flexGrow: 1 }}>
        <div className="eyebrow">Trip signal</div>
        <div className={`signal-word ${level}`}>{WORD[level]}</div>
        <div className="signal-text">{headline}</div>
      </div>
    </section>
  );
}

export function Meter({ probability, level, sub }: { probability: number; level: Level; sub: string }) {
  const pct = Math.round(probability * 100);
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--muted-strong)" }}>Chance of disruption</div>
        <div className={`pct ${level}`}>{level === "unknown" ? "–" : `${pct}%`}</div>
      </div>
      <div className="meter" role="img" aria-label={`${pct}% chance of disruption. Orange starts at 40%, red at 85%.`}>
        <div className="meter-track">
          <div style={{ width: "40%", background: "#bfe3cd" }} />
          <div style={{ width: "45%", background: "#f6d2a6" }} />
          <div style={{ width: "15%", background: "#f2b8b2" }} />
        </div>
        {level !== "unknown" && <div className="meter-marker" style={{ left: `calc(${pct}% - 2px)` }} />}
      </div>
      <div className="meter-scale"><span>0 · green</span><span>40 · orange</span><span>85 · red</span></div>
      <div style={{ marginTop: 12, fontSize: 14, color: "var(--muted)" }}>{sub}</div>
    </div>
  );
}

export function Pill({ level }: { level: Level }) {
  return (
    <span className={`pill ${level}`}>
      <Icon name={LEVEL_ICON[level]} size={13} stroke={2.4} color={DARK_ON[level]} />
      {SHORT[level]}
    </span>
  );
}
