import { handle, HttpError, idParam, json, requireUser } from "@/lib/api";
import { latestAssessment, loadTrip } from "@/lib/trips";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = idParam((await params).id);
  const trip = await loadTrip(id, user.userId);
  if (!trip) throw new HttpError(404, "Trip not found.");
  return json({ trip, assessment: await latestAssessment(id) });
});
