import "server-only";
import bcrypt from "bcryptjs";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { Viewer } from "./permissions";

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

/** Exige sesión. Usar al tope de toda pantalla o server action. */
export async function requireUser(): Promise<Viewer> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige rol de dirección para una acción de escritura.
 *
 * Para PANTALLAS usar `requireAdminOr404`: no queremos contarle al equipo que
 * existe una sección a la que no llega.
 */
export async function requireAdmin(): Promise<Viewer> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/mi-panel");
  return user;
}

/**
 * Como `requireAdmin`, pero devuelve 404 en vez de redirigir con un mensaje.
 *
 * Es deliberado: para el resto del equipo, las pantallas de administración
 * y facturación no existen. Una puerta cerrada con cartel informa de que hay
 * algo detrás; un 404 no.
 */
export async function requireAdminOr404(): Promise<Viewer> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}
