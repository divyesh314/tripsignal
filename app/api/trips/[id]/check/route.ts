import { handle, HttpError, idParam, json, requireUser } from "@/lib/api";
import { notifyIfChanged } from "@/lib/notify";
import { loadTrip, runCheck } from "@/lib/trips";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = idParam((await params).id);
  const trip = await loadTrip(id, user.userId);
  if (!trip) throw new HttpError(404, "Trip not found.");
  const { assessment, previousLevel } = await runCheck(id);
  await notifyIfChanged(assessment, previousLevel, trip.alertsEnabled);
  return json({ assessment });
});
