"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
    const db = getDb();
    const previous = id
      ? (db.prepare("SELECT status, done_at FROM tasks WHERE id = ?").get(id) as
          { status: string; done_at: string | null } | undefined)
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
      db.prepare(
        `UPDATE tasks SET title=?, description=?, category=?, assignee_id=?, client_id=?, status=?,
                          priority=?, due_date=?, done_at=?, blocker=?, channel=?, planned_date=?,
                          published_at=?, updated_at=datetime('now')
         WHERE id=?`,
      ).run(...values, id);
    } else {
      db.prepare(
        `INSERT INTO tasks (title, description, category, assignee_id, client_id, status, priority,
                            due_date, done_at, blocker, channel, planned_date, published_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(...values);
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
  await requireUser();
  const id = F.int(fd, "id");
  if (!id) return;

  const db = getDb();
  const task = db.prepare("SELECT status, category, published_at FROM tasks WHERE id = ?").get(id) as
    { status: string; category: string; published_at: string | null } | undefined;
  if (!task) return;

  if (task.status === "hecho") {
    db.prepare("UPDATE tasks SET status='pendiente', done_at=NULL, updated_at=datetime('now') WHERE id=?").run(id);
  } else {
    // Una pieza de contenido marcada como hecha queda publicada hoy si no
    // tenia fecha: es lo que hace que el cumplimiento del calendario cierre.
    const publishedAt = task.category === "contenido" ? (task.published_at ?? todayISO()) : task.published_at;
    db.prepare(
      "UPDATE tasks SET status='hecho', done_at=?, published_at=?, updated_at=datetime('now') WHERE id=?",
    ).run(todayISO(), publishedAt, id);
  }

  revalidatePath("/tareas");
  revalidatePath("/mi-panel");
}

export async function deleteTask(fd: FormData): Promise<void> {
  await requireUser();
  const id = F.int(fd, "id");
  if (!id) return;
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
  revalidatePath("/tareas");
}

export async function saveAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Solo direccion puede publicar avisos." };

  const title = F.optStr(fd, "title");
  if (!title) return { error: "El aviso necesita un titulo." };

  try {
    getDb()
      .prepare(
        `INSERT INTO announcements (title, body, level, author_id, starts_at, ends_at) VALUES (?,?,?,?,?,?)`,
      )
      .run(
        title,
        F.str(fd, "body"),
        F.pick(fd, "level", ["info", "importante", "urgente"] as const, "info"),
        user.id,
        F.date(fd, "starts_at", todayISO()),
        F.optDate(fd, "ends_at"),
      );

    revalidatePath("/mi-panel");
    revalidatePath("/calendario");
    return { ok: "Aviso publicado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
