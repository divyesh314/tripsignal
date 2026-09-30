import { z } from "zod";
import { handle, HttpError, idParam, json, requireUser } from "@/lib/api";
import { setAlerts } from "@/lib/trips";

const body = z.object({ enabled: z.boolean() });

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = idParam((await params).id);
  const { enabled } = body.parse(await req.json());
  if (!(await setAlerts(id, user.userId, enabled))) throw new HttpError(404, "Trip not found.");
  return json({ enabled });
});
