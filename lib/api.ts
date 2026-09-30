import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser } from "./auth";
import { ValidationError } from "./trips";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Wraps a route handler so every error comes back as { error } JSON with the right status. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ValidationError) return json({ error: e.message }, 400);
      if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? "Invalid input." }, 400);
      console.error(e);
      return json({ error: "Something went wrong on our side. Please try again." }, 500);
    }
  };
}

export function idParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "Trip not found.");
  return id;
}
