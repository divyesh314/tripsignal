import Link from "next/link";
import { DateTime } from "luxon";
import { Icon } from "@/components/Icon";
import { Nav } from "@/components/Nav";
import { Pill } from "@/components/Signal";
import { currentUser } from "@/lib/auth";
import { listTrips } from "@/lib/trips";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const user = await currentUser();
  const trips = user ? await listTrips(user.userId) : [];
  return (
    <div className="page">
      <Nav active="trips" />
      <main className="main">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 className="h1">Your trips</h1>
            <p className="lede">Open a trip to see its signal and what's behind it.</p>
          </div>
          <Link href="/plan" className="btn btn-ink"><Icon name="plus" size={18} stroke={2} /> Plan a trip</Link>
        </div>
        {trips.length === 0 ? (
          <div className="card" style={{ marginTop: 32, padding: 32, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 16 }}>No trips yet.</p>
            <p style={{ margin: "6px 0 18px", color: "var(--muted)" }}>Add your flights and we'll check every airport on the way.</p>
            <Link href="/plan" className="btn btn-go">Plan your first trip</Link>
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "32px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
            {trips.map((t) => (
              <li key={t.id}>
                <Link href={`/trips/${t.id}`} className="action" style={{ padding: "18px 20px" }}>
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{t.route}</div>
                    <div className="action-sub" style={{ fontSize: 14 }}>
                      {DateTime.fromISO(t.travelDate).toFormat("ccc d LLL yyyy")} · {t.flights}
                    </div>
                  </div>
                  {t.level && <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {t.probability != null && t.level !== "unknown" && <span className="mono" style={{ fontSize: 14, color: "var(--muted)" }}>{Math.round(t.probability * 100)}%</span>}
                    <Pill level={t.level} />
                  </span>}
                  <Icon name="chevron" size={18} stroke={2} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
