import { handle, HttpError, json, requireUser } from "@/lib/api";
import { baggageRule } from "@/lib/trips";

export const GET = handle(async (req: Request) => {
  await requireUser();
  const airline = new URL(req.url).searchParams.get("airline")?.toUpperCase();
  if (!airline) throw new HttpError(400, "Pass ?airline=UA");
  const rule = await baggageRule(airline);
  if (!rule) throw new HttpError(404, "No baggage rule for that airline yet.");
  return json({ rule });
});
