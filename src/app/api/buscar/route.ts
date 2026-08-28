import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { all } from "@/lib/db";
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
  const hits: SearchHit[] = [];

  const leads = await all<{ id: number; name: string; company: string; stage: string; outcome: string }>(
    `SELECT id, name, company, stage, outcome FROM leads
     WHERE name ILIKE ? OR company ILIKE ? OR specialty ILIKE ? OR contact_email ILIKE ?
     ORDER BY (outcome = 'open') DESC, id DESC LIMIT 6`,
    [like, like, like, like],
  );

  for (const l of leads) {
    hits.push({
      type: "oportunidad",
      id: l.id,
      title: l.name,
      subtitle: [l.company, l.stage.replace(/_/g, " ")].filter(Boolean).join(" · "),
      href: `/crm/${l.id}`,
    });
  }

  const clients = await all<{ id: number; name: string; specialty: string; plan: string }>(
    `SELECT id, name, specialty, plan FROM clients
     WHERE name ILIKE ? OR specialty ILIKE ? OR plan ILIKE ?
     ORDER BY (churned_at IS NOT NULL), name LIMIT 5`,
    [like, like, like],
  );

  for (const c of clients) {
    hits.push({
      type: "cliente",
      id: c.id,
      title: c.name,
      subtitle: [c.specialty, c.plan].filter(Boolean).join(" · "),
      href: `/clientes/${c.id}`,
    });
  }

  // Con visibilidad abierta la búsqueda alcanza a todo el equipo.
  const ownTasksOnly = !can(user, "equipo:ver_todos");
  const tasks = await all<{ id: number; title: string; category: string; status: string }>(
    `SELECT id, title, category, status FROM tasks
     WHERE title ILIKE ? AND status <> 'cancelada'${ownTasksOnly ? " AND assignee_id = ?" : ""}
     ORDER BY (status = 'hecho'), id DESC LIMIT 4`,
    ownTasksOnly ? [like, user.id] : [like],
  );

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
