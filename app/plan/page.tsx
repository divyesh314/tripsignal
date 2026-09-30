import { Nav } from "@/components/Nav";
import { PlanForm } from "@/components/PlanForm";
import { listAirlines, listAirports } from "@/lib/trips";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const [airports, airlines] = await Promise.all([listAirports(), listAirlines()]);
  return (
    <div className="page">
      <Nav active="plan" />
      <main className="main">
        <h1 className="h1">Where are you flying?</h1>
        <p className="lede">Add every flight in your trip. We check each airport you pass through.</p>
        <PlanForm
          airports={airports.map((a) => ({ iata: a.iata, label: `${a.iata} — ${a.city}`, name: a.name, city: a.city }))}
          airlines={airlines}
        />
      </main>
    </div>
  );
}
