import { z } from "zod";
import { handle, json } from "@/lib/api";
import { checkLogin, setSessionCookie } from "@/lib/auth";

const body = z.object({ email: z.string().min(1, "Enter your email."), password: z.string().min(1, "Enter your password.") });

export const POST = handle(async (req: Request) => {
  const { email, password } = body.parse(await req.json());
  const user = await checkLogin(email, password);
  if (!user) return json({ error: "That email and password don't match." }, 401);
  await setSessionCookie(user.id, user.email);
  return json({ ok: true });
});
