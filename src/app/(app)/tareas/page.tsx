import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { clientsList, usersList, userMap } from "@/lib/queries";
import { formatDate, todayISO } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import TaskForm from "./TaskForm";
import TaskToggle from "./TaskToggle";
import { TASK_CATEGORY_LABEL, TASK_STATUS_LABEL, PRIORITY_LABEL, CHANNEL_LABEL, humanize } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "neutral" | "brand"> = {
  hecho: "ok",
  bloqueado: "risk",
  en_curso: "brand",
  pendiente: "neutral",
  cancelada: "neutral",
};

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const mine = sp.mias === "1";
  const showDone = sp.hechas === "1";
  const category = typeof sp.tipo === "string" ? sp.tipo : "";

  const clauses: string[] = ["t.status <> 'cancelada'"];
  const params: unknown[] = [];
  if (mine) {
    clauses.push("t.assignee_id = ?");
    params.push(user.id);
  }
  if (!showDone) clauses.push("t.status <> 'hecho'");
  if (category) {
    clauses.push("t.category = ?");
    params.push(category);
  }

  const tasks = await all<{
    id: number; title: string; description: string; category: string; assignee_id: number | null;
    status: string; priority: string; due_date: string | null; blocker: string;
    client_name: string | null; channel: string; planned_date: string | null; published_at: string | null;
  }>(
    `SELECT t.*, c.name AS client_name FROM tasks t
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY (t.status = 'hecho'), COALESCE(t.due_date, '9999-12-31'), t.id DESC`,
    params,
  );

  const users = await userMap();
  const today = todayISO();
  const open = tasks.filter((t) => t.status !== "hecho");
  const overdue = open.filter((t) => t.due_date !== null && t.due_date < today);
  const blocked = open.filter((t) => t.status === "bloqueado");

  const link = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (mine) q.set("mias", "1");
    if (showDone) q.set("hechas", "1");
    if (category) q.set("tipo", category);
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/tareas?${q.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Tareas y proyectos"
        description="Trabajo operativo del equipo: proyectos, landings, incidencias, contenido y procesos de gestión."
      >
        <Link href={link({ mias: mine ? null : "1" })} className="btn">
          {mine ? "Ver todas" : "Solo las mias"}
        </Link>
        <Link href={link({ hechas: showDone ? null : "1" })} className="btn">
          {showDone ? "Ocultar hechas" : "Ver hechas"}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Abiertas" value={open.length} />
        <StatCard label="Vencidas" value={overdue.length} tone={overdue.length ? "risk" : "ok"} />
        <StatCard label="Bloqueadas" value={blocked.length} tone={blocked.length ? "warn" : "ok"} />
        <StatCard label="En el filtro" value={tasks.length} />
      </div>

      <Card className="mt-4" title="Listado">
        {tasks.length === 0 ? (
          <EmptyState title="No hay tareas con este filtro" />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Tipo</th>
                  <th>Responsable</th>
                  <th>Cliente</th>
                  <th>Vence</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const isOverdue = t.status !== "hecho" && t.due_date !== null && t.due_date < today;
                  return (
                    <tr key={t.id}>
                      <td>
                        <p className={`font-medium ${t.status === "hecho" ? "text-faint line-through" : ""}`}>
                          {t.title}
                        </p>
                        {t.description && <p className="text-xs text-muted">{t.description}</p>}
                        {t.status === "bloqueado" && <p className="text-xs text-risk">Bloqueo: {t.blocker}</p>}
                        {t.category === "contenido" && t.channel && (
                          <p className="text-xs text-faint">
                            {CHANNEL_LABEL[t.channel] ?? t.channel}
                            {t.planned_date ? ` · planificada ${formatDate(t.planned_date)}` : ""}
                            {t.published_at ? ` · publicada ${formatDate(t.published_at)}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="text-muted">{TASK_CATEGORY_LABEL[t.category] ?? humanize(t.category)}</td>
                      <td className="text-muted">
                        {t.assignee_id ? (users.get(t.assignee_id)?.name ?? "—") : "—"}
                      </td>
                      <td className="text-muted">{t.client_name ?? "—"}</td>
                      <td className={isOverdue ? "text-risk" : "text-muted"}>{formatDate(t.due_date)}</td>
                      <td className="text-muted">{PRIORITY_LABEL[t.priority] ?? humanize(t.priority)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{TASK_STATUS_LABEL[t.status] ?? humanize(t.status)}</Badge>
                      </td>
                      <td className="text-right">
                        <TaskToggle id={t.id} done={t.status === "hecho"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4" title="Nueva tarea">
        <TaskForm users={await usersList()} clients={await clientsList()} defaultAssignee={user.id} />
      </Card>
    </>
  );
}
