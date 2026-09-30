import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { query } from "./db";

export const SESSION_COOKIE = "ts_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set to a long random string");
  return new TextEncoder().encode(s);
}

export async function signSession(userId: number, email: string): Promise<string> {
  return new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setSubject(String(userId))
    .setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}

export async function verifySession(token: string | undefined): Promise<{ userId: number; email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.sub), email: String(payload.email) };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<{ userId: number; email: string } | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(userId: number, email: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId, email), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function createUser(email: string, password: string): Promise<{ id: number } | "exists"> {
  const hash = await bcrypt.hash(password, 10);
  const rows = await query<{ id: string }>("INSERT INTO users (email, password_hash) VALUES (lower($1), $2) ON CONFLICT (email) DO NOTHING RETURNING id", [email, hash]);
  return rows[0] ? { id: Number(rows[0].id) } : "exists";
}

export async function checkLogin(email: string, password: string): Promise<{ id: number; email: string } | null> {
  const rows = await query<{ id: string; email: string; password_hash: string }>("SELECT id, email, password_hash FROM users WHERE email = lower($1)", [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return null;
  return { id: Number(u.id), email: u.email };
}
