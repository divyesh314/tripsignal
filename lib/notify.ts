import { query } from "./db";
import type { StoredAssessment } from "./trips";
import type { Level } from "./types";

const WORD: Record<Level, string> = { green: "green", orange: "orange", red: "red", unknown: "unavailable" };

/**
 * Sends an alert when a trip's signal changes colour. The prototype logs the
 * message and records it; a real deployment would plug in email or web push here.
 */
export async function notifyIfChanged(a: StoredAssessment, previous: Level | null, alertsEnabled: boolean): Promise<boolean> {
  if (!alertsEnabled || previous === null || previous === a.level || a.level === "unknown") return false;
  const message = `Trip ${a.tripId}: signal changed from ${WORD[previous]} to ${WORD[a.level]}. ${a.headline}`;
  await query("INSERT INTO notifications_sent (trip_id, from_level, to_level, channel, message) VALUES ($1,$2,$3,'log',$4)",
    [a.tripId, previous, a.level, message]);
  console.log(`[notify] ${message}`);
  return true;
}
