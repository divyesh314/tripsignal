"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Action } from "@/lib/actions";
import { Icon } from "./Icon";

export function TimeAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState("checked just now");
  useEffect(() => {
    const tick = () => {
      const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
      const clock = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setLabel(mins < 1 ? `checked just now (${clock})` : mins < 60 ? `checked ${mins} min ago (${clock})` : `checked at ${clock}`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [iso]);
  return <span>{label}</span>;
}

export function CheckAgainButton({ tripId }: { tripId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div id="recheck" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button type="button" className="btn btn-ink" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const res = await fetch(`/api/trips/${tripId}/check`, { method: "POST" });
          if (!res.ok) setError((await res.json()).error ?? "Check failed.");
          else router.refresh();
        } catch { setError("Can't reach the server."); }
        finally { setBusy(false); }
      }}>
        <Icon name={busy ? "spinner" : "refresh"} size={18} stroke={1.9} className={busy ? "spin" : undefined} />
        {busy ? "Checking…" : "Check again"}
      </button>
      {error && <span role="alert" className="error" style={{ marginTop: 6 }}>{error}</span>}
    </div>
  );
}

export function AlertsToggle({ tripId, initial }: { tripId: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="toggle" aria-pressed={on} disabled={busy} onClick={async () => {
      const next = !on;
      setOn(next); setBusy(true);
      try {
        const res = await fetch(`/api/trips/${tripId}/alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
        if (!res.ok) setOn(!next);
      } catch { setOn(!next); }
      finally { setBusy(false); }
    }}>
      {on ? "Alerts on" : "Alerts off"}
    </button>
  );
}

export function RedOptionsButton({ options, title, subtitle, shareText }: { options: Action[]; title: string; subtitle: string; shareText: string }) {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; triggerRef.current?.focus(); };
  }, [open]);

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ text: shareText }); setShared("Shared."); return; }
      await navigator.clipboard.writeText(shareText);
      setShared("Message copied. Paste it into a text or email.");
    } catch { /* user cancelled */ }
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="action danger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="warn" size={22} />
        <div style={{ flexGrow: 1 }}>
          <div className="action-title">See your options</div>
          <div className="action-sub">Ride, lounge, later flights and more</div>
        </div>
        <Icon name="chevron" size={18} stroke={2} />
      </button>
      {open && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="red-title" className="modal">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: "var(--red-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="warn" size={22} stroke={2} color="var(--red)" />
              </div>
              <div style={{ flexGrow: 1 }}>
                <h2 id="red-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.2, fontWeight: 700 }}>{title}</h2>
                <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--muted)" }}>{subtitle}</p>
              </div>
              <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(false)}
                style={{ width: 44, height: 44, borderRadius: 22, border: "none", background: "var(--ground)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", flexShrink: 0 }}>
                <Icon name="close" size={18} stroke={2} />
              </button>
            </div>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              {options.map((o) => {
                const body = (
                  <>
                    <Icon name={o.icon} size={22} />
                    <div style={{ flexGrow: 1 }}>
                      <div className="action-title">{o.title}</div>
                      <div className="action-sub">{o.text}</div>
                    </div>
                  </>
                );
                if (o.kind === "share") {
                  return <button key={o.title} type="button" className="action" onClick={share}>{body}<Icon name="chevron" size={18} stroke={2} /></button>;
                }
                return (
                  <a key={o.title} className={`action${o.kind === "primary" ? " primary" : ""}`} href={o.href} target="_blank" rel="noopener noreferrer">
                    {body}<Icon name="external" size={18} stroke={2} /><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                );
              })}
            </div>
            {shared && <p role="status" style={{ margin: "12px 0 0", fontSize: 14, color: "var(--green-fg)" }}>{shared}</p>}
            <button type="button" className="btn btn-ghost" style={{ marginTop: 14, width: "100%", minHeight: 48 }} onClick={() => setOpen(false)}>Not now</button>
          </div>
        </div>
      )}
    </>
  );
}
