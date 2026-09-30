"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ next, initialMode }: { next: string; initialMode: "signin" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(signup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      router.push(next);
      router.refresh();
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ width: "100%", maxWidth: 420, padding: 36 }} noValidate>
      <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700 }}>{signup ? "Create your account" : "Sign in"}</h2>
      <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--muted)" }}>
        {signup ? "Save trips and get alerts when your signal changes." : "Welcome back. Check your next trip in seconds."}
      </p>
      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="field" style={{ gap: 6 }}>
          <label htmlFor="email" className="label label-lg">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" className="input input-lg" />
        </div>
        <div className="field" style={{ gap: 6 }}>
          <label htmlFor="password" className="label label-lg">Password</label>
          <input id="password" name="password" type="password" required minLength={signup ? 8 : undefined}
            autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 8 characters" : "Your password"} className="input input-lg" />
        </div>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" className="btn btn-ink btn-lg" style={{ marginTop: 24, height: 52 }} disabled={busy}>
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 14, color: "var(--muted)" }}>
        {signup ? "Already have an account? " : "New to TripSignal? "}
        <button type="button" onClick={() => { setMode(signup ? "signin" : "signup"); setError(null); }}
          style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", textDecoration: "underline", fontSize: 14 }}>
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
