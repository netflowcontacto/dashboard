import "server-only";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { User } from "./types";

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

/** Exige sesion. Usar al tope de toda pagina o server action. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige rol admin. Es la unica puerta a la informacion financiera sensible. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/mi-panel?sin_acceso=1");
  return user;
}
