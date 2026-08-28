"use server";

import { revalidatePath } from "next/cache";
import { all, one, run, insert } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/dates";
import { errorMessage, type ActionState } from "@/lib/errors";
import * as F from "@/lib/form";

const CATEGORIES = ["tarea", "proyecto", "landing", "incidencia", "correccion", "contenido", "proceso"] as const;
const STATUSES = ["pendiente", "en_curso", "bloqueado", "hecho", "cancelada"] as const;
const PRIORITIES = ["baja", "media", "alta"] as const;
const CHANNELS = ["", "linkedin_netflow", "linkedin_facundo", "instagram", "newsletter", "otro"] as const;

export async function saveTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();

  try {
    const title = F.optStr(fd, "title");
    if (!title) return { error: "La tarea necesita un titulo." };

    const status = F.pick(fd, "status", STATUSES, "pendiente");
    const blocker = F.str(fd, "blocker");
    if (status === "bloqueado" && !blocker) {
      return { error: "Una tarea bloqueada necesita que describas el bloqueo." };
    }

    const id = F.optInt(fd, "id");
    const previous = id
      ? await one<{ status: string; done_at: string | null }>(
          "SELECT status, done_at FROM tasks WHERE id = ?",
          [id],
        )
      : undefined;

    // done_at se maneja solo: se sella al pasar a hecho y se limpia al reabrir.
    const doneAt =
      status === "hecho"
        ? (previous?.done_at ?? F.optDate(fd, "done_at") ?? todayISO())
        : null;

    const values = [
      title,
      F.str(fd, "description"),
      F.pick(fd, "category", CATEGORIES, "tarea"),
      F.optInt(fd, "assignee_id"),
      F.optInt(fd, "client_id"),
      status,
      F.pick(fd, "priority", PRIORITIES, "media"),
      F.optDate(fd, "due_date"),
      doneAt,
      blocker,
      F.pick(fd, "channel", CHANNELS, ""),
      F.optDate(fd, "planned_date"),
      F.optDate(fd, "published_at"),
    ];

    if (id) {
      await run(
        `UPDATE tasks SET title=?, description=?, category=?, assignee_id=?, client_id=?, status=?,
                          priority=?, due_date=?, done_at=?, blocker=?, channel=?, planned_date=?,
                          published_at=?, updated_at=nf_now()
         WHERE id=?`,
        [...values, id],
      );
    } else {
      await run(
        `INSERT INTO tasks (title, description, category, assignee_id, created_by, client_id, status,
                            priority, due_date, done_at, blocker, channel, planned_date, published_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...values.slice(0, 4), user.id, ...values.slice(4)],
      );
    }

    revalidatePath("/tareas");
    revalidatePath("/mi-panel");
    return { ok: "Tarea guardada." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Marcar hecho / reabrir desde el listado, sin abrir la ficha. */
export async function toggleTask(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "tareas:editar")) return;
  const id = F.int(fd, "id");
  if (!id) return;

  const task = await one<{ status: string; category: string; published_at: string | null }>(
    "SELECT status, category, published_at FROM tasks WHERE id = ?",
    [id],
  );
  if (!task) return;

  if (task.status === "hecho") {
    await run("UPDATE tasks SET status='pendiente', done_at=NULL, updated_at=nf_now() WHERE id=?", [id]);
  } else {
    // Una pieza de contenido marcada como hecha queda publicada hoy si no
    // tenía fecha: es lo que hace que el cumplimiento del calendario cierre.
    const publishedAt = task.category === "contenido" ? (task.published_at ?? todayISO()) : task.published_at;
    await run(
      "UPDATE tasks SET status='hecho', done_at=?, published_at=?, updated_at=nf_now() WHERE id=?",
      [todayISO(), publishedAt, id],
    );
  }

  revalidatePath("/tareas");
  revalidatePath("/mi-panel");
}

export async function deleteTask(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "tareas:editar")) return;
  const id = F.int(fd, "id");
  if (!id) return;
  await run("DELETE FROM tasks WHERE id = ?", [id]);
  revalidatePath("/tareas");
}

export async function saveAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Solo dirección puede publicar avisos." };

  const title = F.optStr(fd, "title");
  if (!title) return { error: "El aviso necesita un titulo." };

  try {
    await run(
      `INSERT INTO announcements (title, body, level, author_id, starts_at, ends_at) VALUES (?,?,?,?,?,?)`,
      [
        title,
        F.str(fd, "body"),
        F.pick(fd, "level", ["info", "importante", "urgente"] as const, "info"),
        user.id,
        F.date(fd, "starts_at", todayISO()),
        F.optDate(fd, "ends_at"),
      ],
    );

    revalidatePath("/mi-panel");
    revalidatePath("/calendario");
    return { ok: "Aviso publicado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
