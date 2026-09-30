import { handle, json } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export const POST = handle(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
