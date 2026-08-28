import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { one, getSetting } from "./db";
import type { Viewer } from "./permissions";
import type { User } from "./types";

const COOKIE = "netflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET no está configurado (ver .env.example)");
    }
    return "netflow-dev-secret-no-usar-en-produccion";
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function serialize(userId: number, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function verify(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawId, rawExp, mac] = parts;
  const expected = sign(`${rawId}.${rawExp}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(rawExp) < Date.now()) return null;
  const id = Number(rawId);
  return Number.isInteger(id) ? id : null;
}

export async function createSession(userId: number): Promise<void> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const store = await cookies();
  store.set(COOKIE, serialize(userId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Modo de visibilidad del equipo. Por defecto, transparente. */
export async function visibilityIsOpen(): Promise<boolean> {
  return (await getSetting("visibilidad_equipo", "abierta")) !== "restringida";
}

/**
 * Persona logueada con su modo de visibilidad ya resuelto, o null.
 * No redirige.
 */
export async function getCurrentUser(): Promise<Viewer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const userId = verify(token);
  if (!userId) return null;

  const [user, open] = await Promise.all([
    one<User>(
      "SELECT id, name, email, role, area, job_title, active FROM users WHERE id = ? AND active = 1",
      [userId],
    ),
    visibilityIsOpen(),
  ]);

  if (!user) return null;
  return { ...user, canViewAll: open };
}
