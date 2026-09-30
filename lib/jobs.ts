// Postgres-backed job queue. Workers claim with FOR UPDATE SKIP LOCKED so
// several workers can run in parallel without taking the same job.
import type { PoolClient } from "pg";
import { pool, query } from "./db";

export type Job = { id: number; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };

export async function enqueue(type: string, payload: Record<string, unknown>, runAt = new Date()): Promise<number | null> {
  // The partial unique index stops duplicate active re-checks for the same trip.
  const rows = await query<{ id: string }>(
    `INSERT INTO jobs (type, payload, run_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
    [type, JSON.stringify(payload), runAt]);
  return rows[0] ? Number(rows[0].id) : null;
}

export async function claim(): Promise<Job | null> {
  const client: PoolClient = await pool().connect();
  try {
    const { rows } = await client.query<Job & { id: string }>(
      `UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
       WHERE id = (
         SELECT id FROM jobs WHERE status = 'pending' AND run_at <= now()
         ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       RETURNING id, type, payload, attempts, max_attempts`);
    return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
  } finally {
    client.release();
  }
}

export async function complete(id: number): Promise<void> {
  await query("UPDATE jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1", [id]);
}

export async function fail(job: Job, err: Error): Promise<void> {
  const retry = job.attempts < job.max_attempts;
  // Back off 2, 4, 8... minutes before retrying.
  await query(
    `UPDATE jobs SET status = $2, last_error = $3, locked_at = NULL,
            run_at = CASE WHEN $2 = 'pending' THEN now() + ($4 || ' minutes')::interval ELSE run_at END,
            finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END
     WHERE id = $1`,
    [job.id, retry ? "pending" : "failed", err.message.slice(0, 1000), String(2 ** job.attempts)]);
}

/** Jobs stuck in 'running' (worker crashed) go back to the queue after 10 minutes. */
export async function releaseStale(): Promise<number> {
  const rows = await query("UPDATE jobs SET status = 'pending', locked_at = NULL WHERE status = 'running' AND locked_at < now() - interval '10 minutes' RETURNING id");
  return rows.length;
}

/**
 * Queues an hourly re-check for every trip with alerts on that departs in the
 * next 48 hours and hasn't been checked in the last hour.
 */
export async function scheduleDueRechecks(): Promise<number> {
  const rows = await query<{ id: string }>(
    `SELECT t.id FROM trips t
     JOIN trip_legs l ON l.trip_id = t.id AND l.seq = 1
     WHERE t.alerts_enabled
       AND (l.dep_date + l.dep_time) BETWEEN (now() AT TIME ZONE 'UTC') - interval '1 day' AND (now() AT TIME ZONE 'UTC') + interval '2 days'
       AND NOT EXISTS (SELECT 1 FROM risk_assessments ra WHERE ra.trip_id = t.id AND ra.checked_at > now() - interval '55 minutes')`);
  let queued = 0;
  for (const r of rows) if (await enqueue("recheck_trip", { tripId: String(r.id) })) queued++;
  return queued;
}
