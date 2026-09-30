import { z } from "zod";
import { handle, json } from "@/lib/api";
import { createUser, setSessionCookie } from "@/lib/auth";

const body = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password."),
});

export const POST = handle(async (req: Request) => {
  const { email, password } = body.parse(await req.json());
  const res = await createUser(email, password);
  if (res === "exists") return json({ error: "An account with this email already exists. Sign in instead." }, 409);
  await setSessionCookie(res.id, email.toLowerCase());
  return json({ ok: true });
});
