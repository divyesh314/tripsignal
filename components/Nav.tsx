import Link from "next/link";
import { Icon } from "./Icon";
import { SignOutButton } from "./SignOutButton";

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-lights" aria-hidden="true">
        <span style={{ background: "var(--lit-red)" }} />
        <span style={{ background: "var(--lit-orange)" }} />
        <span style={{ background: "var(--lit-green)" }} />
      </span>
      <span className="logo-word">TripSignal</span>
    </span>
  );
}

export function Nav({ active }: { active: "plan" | "trips" | "bags" }) {
  const link = (key: typeof active, href: string, label: string) => (
    <Link href={href} className="nav-link" aria-current={active === key ? "page" : undefined}>{label}</Link>
  );
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/plan" aria-label="TripSignal home" style={{ textDecoration: "none" }}><Logo /></Link>
        <nav aria-label="Main" className="nav-links">
          {link("plan", "/plan", "Plan a trip")}
          {link("trips", "/trips", "Trip signal")}
          {link("bags", "/baggage", "Baggage")}
        </nav>
        <SignOutButton />
      </div>
    </header>
  );
}

export { Icon };
