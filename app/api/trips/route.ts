import { handle, json, requireUser } from "@/lib/api";
import { createTrip, listTrips, loadTrip, runCheck, tripInput } from "@/lib/trips";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireUser();
  return json({ trips: await listTrips(user.userId) });
});

/** Saves the trip, then runs the first check so the result page has something to show. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const input = tripInput.parse(await req.json());
  const tripId = await createTrip(user.userId, input);
  await runCheck(tripId);
  const trip = await loadTrip(tripId, user.userId);
  return json({ tripId, trip }, 201);
});
