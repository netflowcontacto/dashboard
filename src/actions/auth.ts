"use server";

import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";
import { homeFor } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa email y contraseña." };
  }

  const user = await one<{ id: number; password_hash: string; role: Role; active: number }>(
    "SELECT id, password_hash, role, active FROM users WHERE lower(email) = ?",
    [email],
  );

  // Mensaje generico a propósito: no revelamos si el email existe.
  if (!user || user.active !== 1 || !verifyPassword(password, user.password_hash)) {
    return { error: "Email o contraseña incorrectos." };
  }

  await createSession(user.id);
  redirect(homeFor(user));
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
