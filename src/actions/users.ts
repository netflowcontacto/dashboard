"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { errorMessage, type ActionState } from "@/lib/errors";
import * as F from "@/lib/form";

const ROLES = ["admin", "member"] as const;
const AREAS = ["direccion", "closer", "paid_media", "setter", "desarrollo", "marketing"] as const;

export async function saveUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();

  try {
    const id = F.optInt(fd, "id");
    const name = F.optStr(fd, "name");
    const email = F.optStr(fd, "email")?.toLowerCase() ?? null;
    if (!name || !email) return { error: "Nombre y email son obligatorios." };

    const role = F.pick(fd, "role", ROLES, "member");
    const area = F.pick(fd, "area", AREAS, "direccion");
    const jobTitle = F.str(fd, "job_title");
    const active = F.bool(fd, "active");
    const password = F.str(fd, "password");

    if (id) {
      await run(
        "UPDATE users SET name=?, email=?, role=?, area=?, job_title=?, active=? WHERE id=?",
        [name, email, role, area, jobTitle, active, id],
      );
      if (password) {
        if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
        await run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(password), id]);
      }
    } else {
      if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
      await run(
        "INSERT INTO users (name, email, password_hash, role, area, job_title, active) VALUES (?,?,?,?,?,?,?)",
        [name, email, hashPassword(password), role, area, jobTitle, 1],
      );
    }

    revalidatePath("/ajustes");
    return { ok: "Usuario guardado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function toggleUserActive(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = F.int(fd, "id");
  // Nadie se puede desactivar a si mismo: evita quedarse sin ningún admin.
  if (!id || id === admin.id) return;

  await run("UPDATE users SET active = 1 - active WHERE id = ?", [id]);
  revalidatePath("/ajustes");
}
