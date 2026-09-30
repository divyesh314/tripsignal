import { json } from "@/lib/api";
import { runOnce } from "@/lib/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly re-check endpoint. Called by the GitHub Actions workflow in
 * .github/workflows/recheck.yml with "Authorization: Bearer <CRON_SECRET>".
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    return json({ ok: true, ...(await runOnce(45_000)) });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
}
