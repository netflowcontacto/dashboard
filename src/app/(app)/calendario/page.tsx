import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { addDays, formatDate, formatDateTime, startOfWeek, todayISO } from "@/lib/dates";
import { userMap } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { MEETING_OUTCOME_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Calendario operativo.
 *
 * En V1 se alimenta de lo que ya vive en el sistema: reuniones del CRM,
 * vencimientos de tareas y próximas acciones. Cuando entre Calendly /
 * Google Calendar (V2) las reuniones van a llegar por webhook a la tabla
 * `meetings` y esta página las va a mostrar sin cambios estructurales.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = sp.mias === "1";

  const today = todayISO();
  const from = startOfWeek(today);
  const to = addDays(from, 27); // 4 semanas

  const meetingFilter = mine ? " AND (l.closer_id = ? OR l.setter_id = ? OR l.owner_id = ?)" : "";
  const meetingParams = mine ? [user.id, user.id, user.id] : [];

  const meetings = await all<{
  id: number; name: string; company: string; meeting_at: string;
  meeting_outcome: string; closer_id: number | null; setter_id: number | null;
  }>(
      `SELECT l.id, l.name, l.company, l.meeting_at, l.meeting_outcome, l.closer_id, l.setter_id
       FROM leads l
       WHERE l.meeting_at IS NOT NULL AND substr(l.meeting_at,1,10) BETWEEN ? AND ?${meetingFilter}
       ORDER BY l.meeting_at`,
      [from, to, ...meetingParams],
  );

  const taskFilter = mine ? " AND assignee_id = ?" : "";
  const deadlines = await all<{
    id: number; title: string; due_date: string; status: string; category: string; assignee_id: number | null;
  }>(
    `SELECT id, title, due_date, status, category, assignee_id FROM tasks
     WHERE due_date BETWEEN ? AND ? AND status NOT IN ('hecho','cancelada')${taskFilter}
     ORDER BY due_date`,
    [from, to, ...(mine ? [user.id] : [])],
  );

  const actions = await all<{
    id: number; name: string; next_action: string; next_action_date: string; owner_id: number;
  }>(
    `SELECT id, name, next_action, next_action_date, owner_id FROM leads
     WHERE outcome = 'open' AND next_action_date BETWEEN ? AND ?${mine ? " AND owner_id = ?" : ""}
     ORDER BY next_action_date`,
    [from, to, ...(mine ? [user.id] : [])],
  );

  const content = await all<{
    id: number; title: string; channel: string; planned_date: string; published_at: string | null;
  }>(
    `SELECT id, title, channel, planned_date, published_at FROM tasks
     WHERE category = 'contenido' AND planned_date BETWEEN ? AND ?${taskFilter}
     ORDER BY planned_date`,
    [from, to, ...(mine ? [user.id] : [])],
  );

  const users = await userMap();
  const days = Array.from({ length: 28 }, (_, i) => addDays(from, i));

  const byDay = new Map<string, { kind: string; label: string; detail: string; href: string; tone: "brand" | "warn" | "risk" | "neutral" }[]>();
  const push = (day: string, item: { kind: string; label: string; detail: string; href: string; tone: "brand" | "warn" | "risk" | "neutral" }) => {
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(item);
  };

  for (const m of meetings) {
    push(m.meeting_at.slice(0, 10), {
      kind: "reunión",
      label: m.name,
      detail: `Reunión ${m.meeting_at.slice(11, 16)}${m.company ? ` · ${m.company}` : ""}`,
      href: `/crm/${m.id}`,
      tone: m.meeting_outcome === "no_show" ? "risk" : "brand",
    });
  }
  for (const d of deadlines) {
    push(d.due_date, {
      kind: "tarea",
      label: d.title,
      detail: `Vence · ${d.category}${d.assignee_id ? ` · ${users.get(d.assignee_id)?.name ?? ""}` : ""}`,
      href: "/tareas",
      tone: d.due_date < today ? "risk" : "warn",
    });
  }
  for (const a of actions) {
    push(a.next_action_date, {
      kind: "acción",
      label: a.name,
      detail: `${a.next_action} · ${users.get(a.owner_id)?.name ?? ""}`,
      href: `/crm/${a.id}`,
      tone: a.next_action_date < today ? "risk" : "neutral",
    });
  }
  for (const c of content) {
    push(c.planned_date, {
      kind: "contenido",
      label: c.title,
      detail: `Contenido${c.channel ? ` · ${c.channel}` : ""}${c.published_at ? " · publicado" : ""}`,
      href: "/tareas?tipo=contenido",
      tone: c.published_at ? "brand" : "warn",
    });
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Próximas 4 semanas: reuniones, vencimientos, próximas acciones del CRM y calendario de contenido."
      >
        <Link href={mine ? "/calendario" : "/calendario?mias=1"} className="btn">
          {mine ? "Ver todo el equipo" : "Solo lo mio"}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reuniones" value={meetings.length} />
        <StatCard label="Vencimientos" value={deadlines.length} />
        <StatCard label="Próximas acciones" value={actions.length} />
        <StatCard label="Piezas de contenido" value={content.length} />
      </div>

      <Card className="mt-4" title="Agenda">
        {byDay.size === 0 ? (
          <EmptyState
            title="No hay nada agendado en las próximas 4 semanas"
            detail="Las reuniones se cargan desde la ficha de cada oportunidad en el CRM."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {days.map((day) => {
              const items = byDay.get(day);
              if (!items || items.length === 0) return null;
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className={`rounded-lg border p-2.5 ${isToday ? "border-brand bg-brand-soft" : "border-border bg-surface"}`}
                >
                  <p className={`mb-1.5 text-xs font-semibold ${isToday ? "text-brand" : "text-faint"}`}>
                    {formatDate(day)}
                    {isToday && " · hoy"}
                  </p>
                  <ul className="space-y-1.5">
                    {items.map((it, i) => (
                      <li key={`${day}-${i}`}>
                        <Link href={it.href} className="tap hover:underline">
                          <span className="text-sm font-medium">{it.label}</span>
                          <span className="block text-xs text-muted">{it.detail}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-4" title="Reuniones en detalle">
        {meetings.length === 0 ? (
          <EmptyState title="Sin reuniones en el rango" />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Cuando</th>
                  <th>Oportunidad</th>
                  <th>Empresa</th>
                  <th>Closer</th>
                  <th>Setter</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id}>
                    <td className="text-muted">{formatDateTime(m.meeting_at)}</td>
                    <td>
                      <Link href={`/crm/${m.id}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>
                    </td>
                    <td className="text-muted">{m.company || "—"}</td>
                    <td className="text-muted">{m.closer_id ? users.get(m.closer_id)?.name : "—"}</td>
                    <td className="text-muted">{m.setter_id ? users.get(m.setter_id)?.name : "—"}</td>
                    <td>
                      <Badge
                        tone={
                          m.meeting_outcome === "realizada" ? "ok" : m.meeting_outcome === "no_show" ? "risk" : "brand"
                        }
                      >
                        {MEETING_OUTCOME_LABEL[m.meeting_outcome] ?? m.meeting_outcome}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        V1: el calendario se arma con lo que ya esta cargado en el sistema. La sincronización con
        Calendly y Google Calendar esta preparada en{" "}
        <Link href="/integraciones" className="text-brand hover:underline">
          Integraciones
        </Link>{" "}
        y es lo primero de la V2.
      </p>
    </>
  );
}
