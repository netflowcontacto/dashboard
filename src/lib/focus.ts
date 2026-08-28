import "server-only";
import { all } from "./db";
import { addDays, dueLabel, todayISO } from "./dates";
import type { Viewer } from "./permissions";

/**
 * "Por dónde empiezo hoy".
 *
 * Un panel lleno de tarjetas informa, pero no dirige. Este bloque toma todo lo
 * que le corresponde a la persona y devuelve las pocas cosas que de verdad
 * tiene que mover hoy, ordenadas por urgencia real y cada una con su enlace.
 *
 * El criterio es lo que se rompe si no se hace hoy, no lo que está pendiente:
 * una reunión de mañana pesa más que una tarea sin fecha.
 */

export interface FocusItem {
  id: string;
  titulo: string;
  detalle: string;
  href: string;
  urgencia: "vencido" | "hoy" | "proximo";
  tipo: "accion" | "reunion" | "tarea" | "contacto";
}

export async function focusFor(viewer: Viewer, asOf = todayISO()): Promise<FocusItem[]> {
  const manana = addDays(asOf, 1);
  const items: FocusItem[] = [];

  const [acciones, reuniones, tareas, sinContactar] = await Promise.all([
    all<{ id: number; name: string; next_action: string; next_action_date: string }>(
      `SELECT id, name, next_action, next_action_date FROM leads
       WHERE outcome = 'open' AND owner_id = ?
         AND next_action_date IS NOT NULL AND next_action_date <= ?
       ORDER BY next_action_date LIMIT 8`,
      [viewer.id, asOf],
    ),
    all<{ id: number; name: string; meeting_at: string }>(
      `SELECT id, name, meeting_at FROM leads
       WHERE meeting_outcome = 'agendada'
         AND substr(meeting_at,1,10) BETWEEN ? AND ?
         AND (closer_id = ? OR setter_id = ? OR owner_id = ?)
       ORDER BY meeting_at LIMIT 5`,
      [asOf, manana, viewer.id, viewer.id, viewer.id],
    ),
    all<{ id: number; title: string; due_date: string; status: string }>(
      `SELECT id, title, due_date, status FROM tasks
       WHERE assignee_id = ? AND status IN ('pendiente','en_curso','bloqueado')
         AND due_date IS NOT NULL AND due_date <= ?
       ORDER BY due_date LIMIT 6`,
      [viewer.id, asOf],
    ),
    all<{ id: number; name: string; entered_at: string }>(
      `SELECT id, name, entered_at FROM leads
       WHERE outcome = 'open' AND first_contacted_at IS NULL AND owner_id = ?
       ORDER BY entered_at LIMIT 5`,
      [viewer.id],
    ),
  ]);

  // Un lead sin contactar es lo más caro de dejar pasar: se enfría solo.
  for (const l of sinContactar) {
    items.push({
      id: `contacto-${l.id}`,
      titulo: `Contactar a ${l.name}`,
      detalle: `Ingresó ${dueLabel(l.entered_at, asOf).replace("vencida ", "").replace("vence ", "")}`,
      href: `/crm/${l.id}`,
      urgencia: "vencido",
      tipo: "contacto",
    });
  }

  for (const r of reuniones) {
    const hoy = r.meeting_at.slice(0, 10) === asOf;
    items.push({
      id: `reunion-${r.id}`,
      titulo: `Reunión con ${r.name}`,
      detalle: `${hoy ? "Hoy" : "Mañana"} ${r.meeting_at.slice(11, 16)}`,
      href: `/crm/${r.id}`,
      urgencia: hoy ? "hoy" : "proximo",
      tipo: "reunion",
    });
  }

  for (const a of acciones) {
    items.push({
      id: `accion-${a.id}`,
      titulo: a.next_action,
      detalle: `${a.name} · ${dueLabel(a.next_action_date, asOf)}`,
      href: `/crm/${a.id}`,
      urgencia: a.next_action_date < asOf ? "vencido" : "hoy",
      tipo: "accion",
    });
  }

  for (const t of tareas) {
    items.push({
      id: `tarea-${t.id}`,
      titulo: t.title,
      detalle: dueLabel(t.due_date, asOf),
      href: "/tareas?mias=1",
      urgencia: t.due_date < asOf ? "vencido" : "hoy",
      tipo: "tarea",
    });
  }

  const orden = { vencido: 0, hoy: 1, proximo: 2 };
  return items.sort((a, b) => orden[a.urgencia] - orden[b.urgencia]).slice(0, 7);
}
