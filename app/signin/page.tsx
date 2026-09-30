import { AuthForm } from "@/components/AuthForm";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Nav";
import { LEVEL_ICON } from "@/components/Signal";

const LEGEND = [
  { level: "green", word: "Green", text: "Under 40%. You're good to go." },
  { level: "orange", word: "Orange", text: "40–84%. Possible disruption. Keep watching." },
  { level: "red", word: "Red", text: "85% or more. Likely. We show you what to do." },
] as const;

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") ? sp.next : "/plan";
  return (
    <div className="auth">
      <section className="auth-brand">
        <Logo />
        <h1 style={{ margin: "88px 0 0", fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1.02, fontWeight: 700, letterSpacing: "-0.02em", maxWidth: 520 }}>
          Know before you go.
        </h1>
        <p style={{ margin: "20px 0 0", fontSize: 18, lineHeight: 1.55, color: "var(--on-ink-soft)", maxWidth: 480 }}>
          One signal for your whole trip: weather, FAA airport status and news for every airport on your route, including connections.
        </p>
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 16 }}>
          {LEGEND.map((l) => (
            <div key={l.level} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className={`light light-${l.level} on`} style={{ width: 34, height: 34, boxShadow: "none" }}>
                <Icon name={LEVEL_ICON[l.level]} size={16} stroke={2.4} color="var(--ink-deep)" />
              </div>
              <div style={{ fontSize: 15, color: "var(--on-ink)" }}><strong style={{ color: "#fff" }}>{l.word}</strong> · {l.text}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="auth-form">
        <AuthForm next={next} initialMode={sp.mode === "signup" ? "signup" : "signin"} />
      </section>
    </div>
  );
}
