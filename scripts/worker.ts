// Long-running worker for hosts that support one (or your own machine):
//   npm run worker
// On Vercel/free hosting, use /api/cron/recheck instead (see README).
import { processOne } from "../lib/runner";
import { releaseStale, scheduleDueRechecks } from "../lib/jobs";

const POLL_MS = 5_000;
const SCHEDULE_EVERY_MS = 60_000;
let stopping = false;

async function main() {
  console.log("[worker] started");
  let lastSchedule = 0;
  while (!stopping) {
    if (Date.now() - lastSchedule > SCHEDULE_EVERY_MS) {
      const released = await releaseStale();
      const queued = await scheduleDueRechecks();
      if (queued || released) console.log(`[worker] queued ${queued} re-checks, released ${released} stale jobs`);
      lastSchedule = Date.now();
    }
    while (!stopping && (await processOne())) { /* drain the queue */ }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("[worker] stopped");
  process.exit(0);
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
main().catch((e) => { console.error(e); process.exit(1); });
