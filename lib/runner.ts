// Shared job processing, used by the long-running worker (scripts/worker.ts)
// and by the /api/cron/recheck endpoint (for hosts without background workers).
import { claim, complete, fail, releaseStale, scheduleDueRechecks } from "./jobs";
import { notifyIfChanged } from "./notify";
import { loadTrip, runCheck } from "./trips";

export async function processOne(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  try {
    if (job.type !== "recheck_trip") throw new Error(`Unknown job type ${job.type}`);
    const tripId = Number(job.payload.tripId);
    const trip = await loadTrip(tripId);
    if (trip) {
      const { assessment, previousLevel } = await runCheck(tripId);
      await notifyIfChanged(assessment, previousLevel, trip.alertsEnabled);
      console.log(`[jobs] trip ${tripId}: ${assessment.level} (${Math.round(assessment.probability * 100)}%)`);
    }
    await complete(job.id);
  } catch (e) {
    console.error(`[jobs] job ${job.id} failed:`, (e as Error).message);
    await fail(job, e as Error);
  }
  return true;
}

/** Queue due re-checks, then work through the queue until empty or out of time. */
export async function runOnce(budgetMs = 45_000): Promise<{ queued: number; released: number; processed: number }> {
  const started = Date.now();
  const released = await releaseStale();
  const queued = await scheduleDueRechecks();
  let processed = 0;
  while (Date.now() - started < budgetMs && (await processOne())) processed++;
  return { queued, released, processed };
}
