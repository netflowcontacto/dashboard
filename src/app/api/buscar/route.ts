import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SearchHit {
  type: "oportunidad" | "cliente" | "tarea";
  id: number;
  title: string;
  subtitle: string;
  href: string;
}

/** Búsqueda global para la paleta de comandos. Respeta la sesión y los permisos. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const like = `%${q}%`;
  const db = getDb();
  const hits: SearchHit[] = [];

  const leads = db
    .prepare(
      `SELECT id, name, company, stage, outcome FROM leads
       WHERE name LIKE ? OR company LIKE ? OR specialty LIKE ? OR contact_email LIKE ?
       ORDER BY outcome = 'open' DESC, id DESC LIMIT 6`,
    )
    .all(like, like, like, like) as
    { id: number; name: string; company: string; stage: string; outcome: string }[];

  for (const l of leads) {
    hits.push({
      type: "oportunidad",
      id: l.id,
      title: l.name,
      subtitle: [l.company, l.stage.replace(/_/g, " ")].filter(Boolean).join(" · "),
      href: `/crm/${l.id}`,
    });
  }

  const clients = db
    .prepare(
      `SELECT id, name, specialty, plan FROM clients
       WHERE name LIKE ? OR specialty LIKE ? OR plan LIKE ?
       ORDER BY churned_at IS NOT NULL, name LIMIT 5`,
    )
    .all(like, like, like) as { id: number; name: string; specialty: string; plan: string }[];

  for (const c of clients) {
    hits.push({
      type: "cliente",
      id: c.id,
      title: c.name,
      subtitle: [c.specialty, c.plan].filter(Boolean).join(" · "),
      href: `/clientes/${c.id}`,
    });
  }

  // El equipo solo ve sus propias tareas en la búsqueda rápida.
  const ownTasksOnly = !can(user, "equipo:ver_todos");
  const tasks = db
    .prepare(
      `SELECT id, title, category, status FROM tasks
       WHERE title LIKE ? AND status <> 'cancelada'${ownTasksOnly ? " AND assignee_id = ?" : ""}
       ORDER BY status = 'hecho', id DESC LIMIT 4`,
    )
    .all(...(ownTasksOnly ? [like, user.id] : [like])) as
    { id: number; title: string; category: string; status: string }[];

  for (const t of tasks) {
    hits.push({
      type: "tarea",
      id: t.id,
      title: t.title,
      subtitle: `${t.category} · ${t.status.replace(/_/g, " ")}`,
      href: "/tareas",
    });
  }

  return NextResponse.json({ hits });
}
