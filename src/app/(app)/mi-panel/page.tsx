import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { resolveRange, monthOf, formatPeriod, formatDate, formatDateTime, todayISO, addDays } from "@/lib/dates";
import { performanceFor } from "@/lib/metrics/team";
import { areaProgress, companyProgress, periodElapsedPct, headlineObjective } from "@/lib/metrics/objectives";
import { areaMetrics } from "@/lib/metrics/team";
import { alertsFor, SEVERITY_LABEL } from "@/lib/alerts";
import { baseCurrency } from "@/lib/fx";
import { AREA_LABEL } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatCard, formatMetric, formatPct } from "@/components/ui";
import RangePicker from "@/components/RangePicker";
import TaskToggle from "../tareas/TaskToggle";
import { MEETING_OUTCOME_LABEL, TASK_CATEGORY_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Mi panel — la vista del equipo.
 *
 * Muestra: objetivo general de NetFlow, progreso del mes, clientes nuevos,
 * objetivos del area, resultado individual, tareas, deadlines, calendario,
 * reuniones, avisos, bloqueos y performance del area.
 *
 * NO muestra (garantizado por permisos, no por omision de la UI): caja total,
 * margenes, costos de otras personas, capital disponible ni rentabilidad.
 * Ninguna consulta financiera se ejecuta en esta página para quien no tiene
 * el permiso 'finanzas:ver'.
 */
export default async function MiPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const db = getDb();
  const today = todayISO();
  const period = monthOf(range.to);
  const cur = baseCurrency();

  const me = performanceFor(user, range);
  const company = companyProgress(period, today);
  const headline = headlineObjective(period, today);
  const elapsed = periodElapsedPct(period, today);

  const areaTeam = db
    .prepare("SELECT id FROM users WHERE area = ? AND active = 1")
    .all(user.area) as { id: number }[];
  const area = areaProgress(user.area, period, today);
  const areaResults = areaMetrics(user.area, range, areaTeam.map((u) => u.id));

  const newClients = db
    .prepare(
      "SELECT COUNT(*) AS n FROM clients WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL",
    )
    .get(range.from, range.to) as { n: number };

  const myTasks = db
    .prepare(
      `SELECT id, title, category, status, priority, due_date, blocker, client_id
       FROM tasks
       WHERE assignee_id = ? AND status <> 'cancelada'
       ORDER BY status = 'hecho', COALESCE(due_date, '9999-12-31'), priority = 'baja', id DESC
       LIMIT 25`,
    )
    .all(user.id) as {
      id: number; title: string; category: string; status: string; priority: string;
      due_date: string | null; blocker: string; client_id: number | null;
    }[];

  const myMeetings = db
    .prepare(
      `SELECT l.id, l.name, l.company, l.meeting_at, l.meeting_outcome
       FROM leads l
       WHERE l.meeting_at IS NOT NULL
         AND substr(l.meeting_at,1,10) BETWEEN ? AND ?
         AND (l.closer_id = ? OR l.setter_id = ? OR l.owner_id = ?)
       ORDER BY l.meeting_at`,
    )
    .all(addDays(today, -1), addDays(today, 14), user.id, user.id, user.id) as {
      id: number; name: string; company: string; meeting_at: string; meeting_outcome: string;
    }[];

  const myLeads = db
    .prepare(
      `SELECT id, name, company, next_action, next_action_date, stage
       FROM leads
       WHERE outcome = 'open' AND owner_id = ?
       ORDER BY COALESCE(next_action_date, '9999-12-31') LIMIT 12`,
    )
    .all(user.id) as {
      id: number; name: string; company: string; next_action: string | null;
      next_action_date: string | null; stage: string;
    }[];

  const announcements = db
    .prepare(
      `SELECT id, title, body, level, starts_at FROM announcements
       WHERE starts_at <= ? AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY starts_at DESC LIMIT 5`,
    )
    .all(today, today) as { id: number; title: string; body: string; level: string; starts_at: string }[];

  const myAlerts = alertsFor(user, today).slice(0, 8);
  const blockers = myTasks.filter((t) => t.status === "bloqueado");
  const overdueTasks = myTasks.filter(
    (t) => t.status !== "hecho" && t.due_date !== null && t.due_date < today,
  );

  const noAccess = sp.sin_acceso === "1";

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name.split(" ")[0]}`}
        description={`${user.job_title || AREA_LABEL[user.area]} · ${formatPeriod(period)}`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      {noAccess && (
        <p className="mb-4 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-sm text-warn">
          Esa sección es de dirección. Acá tenes todo lo tuyo.
        </p>
      )}

      {/* Objetivo general de NetFlow ---------------------------------------- */}
      <Card className="mb-4" title="Objetivo general de NetFlow" subtitle={formatPeriod(period)}>
        {headline ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">{headline.label}</p>
              <p className="tnum mt-1 text-3xl font-semibold">
                {headline.current ?? 0}
                <span className="text-lg font-normal text-faint"> / {headline.target}</span>
              </p>
            </div>
            <div className="min-w-56 flex-1">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>{formatPct(headline.pct)} cumplido</span>
                <span className="text-faint">quedan {company.daysLeft} día(s)</span>
              </div>
              <ProgressBar pct={headline.pct} expectedPct={elapsed} size="lg" />
            </div>
          </div>
        ) : (
          <EmptyState title="Todavia no hay objetivo general cargado para este mes" />
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes nuevos del período" value={newClients.n} tone={newClients.n > 0 ? "ok" : "neutral"} />
        <StatCard
          label="Mi cumplimiento"
          value={me.progress.pct === null ? "sin objetivos" : formatPct(me.progress.pct)}
          tone={me.progress.pct === null ? "neutral" : me.progress.status === "atrasado" ? "warn" : "ok"}
        />
        <StatCard label="Mis tareas abiertas" value={myTasks.filter((t) => t.status !== "hecho").length} />
        <StatCard
          label="Tareas vencidas"
          value={overdueTasks.length}
          tone={overdueTasks.length > 0 ? "risk" : "ok"}
        />
      </div>

      {/* Resultado individual ---------------------------------------------- */}
      <Card
        className="mt-4"
        title="Mi resultado"
        subtitle="Contra mis objetivos del mes. Solo lo ves vos y dirección."
      >
        <ProgressBar
          pct={me.progress.pct}
          expectedPct={me.progress.expectedPct}
          size="lg"
          emptyLabel="Todavia no tenes objetivos cargados para este mes."
        />
        {me.progress.objectives.length > 0 && (
          <div className="mt-4 scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Objetivo</th>
                  <th className="text-right">Voy</th>
                  <th className="text-right">Meta</th>
                  <th className="text-right">Falta</th>
                  <th className="w-32">Progreso</th>
                </tr>
              </thead>
              <tbody>
                {me.progress.objectives.map((o) => (
                  <tr key={o.objective.id}>
                    <td className="font-medium">{o.label}</td>
                    <td className="tnum text-right">{formatMetric(o.current, o.unit, cur)}</td>
                    <td className="tnum text-right text-muted">{formatMetric(o.target, o.unit, cur)}</td>
                    <td className="tnum text-right text-muted">
                      {o.missing === null ? "—" : formatMetric(o.missing, o.unit, cur)}
                    </td>
                    <td>
                      <ProgressBar pct={o.pct} expectedPct={o.expectedPct} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
            Mis métricas de la función
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {me.metrics.map((m) => (
              <div key={m.key} className="rounded-lg border border-border bg-surface-2 p-2.5">
                <p className="text-xs text-muted">{m.label}</p>
                <p className="tnum mt-0.5 text-lg font-semibold">{formatMetric(m.value, m.unit, cur)}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Tareas y bloqueos ----------------------------------------------- */}
        <Card
          title="Mis tareas y proyectos"
          action={
            <Link href="/tareas" className="text-xs text-brand hover:underline">
              Ver todas
            </Link>
          }
        >
          {myTasks.length === 0 ? (
            <EmptyState title="No tenes tareas asignadas" />
          ) : (
            <ul className="divide-y divide-border">
              {myTasks.map((t) => {
                const overdue = t.status !== "hecho" && t.due_date !== null && t.due_date < today;
                return (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className={`text-sm ${t.status === "hecho" ? "text-faint line-through" : ""}`}>
                        {t.title}
                      </p>
                      <p className="text-xs text-faint">
                        {TASK_CATEGORY_LABEL[t.category] ?? t.category}
                        {t.due_date && (
                          <span className={overdue ? "text-risk" : ""}> · vence {formatDate(t.due_date)}</span>
                        )}
                      </p>
                      {t.status === "bloqueado" && <p className="text-xs text-risk">Bloqueo: {t.blocker}</p>}
                    </div>
                    <TaskToggle id={t.id} done={t.status === "hecho"} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Calendario / reuniones ------------------------------------------ */}
        <Card
          title="Mis próximas reuniones"
          action={
            <Link href="/calendario" className="text-xs text-brand hover:underline">
              Ver calendario
            </Link>
          }
        >
          {myMeetings.length === 0 ? (
            <EmptyState title="No tenes reuniones agendadas en los próximos 14 días" />
          ) : (
            <ul className="divide-y divide-border">
              {myMeetings.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                  <div className="min-w-0">
                    <Link href={`/crm/${m.id}`} className="text-sm font-medium hover:underline">
                      {m.name}
                    </Link>
                    {m.company && <p className="text-xs text-muted">{m.company}</p>}
                    <p className="text-xs text-faint">{formatDateTime(m.meeting_at)}</p>
                  </div>
                  <Badge
                    tone={
                      m.meeting_outcome === "realizada" ? "ok" : m.meeting_outcome === "no_show" ? "risk" : "brand"
                    }
                  >
                    {MEETING_OUTCOME_LABEL[m.meeting_outcome] ?? m.meeting_outcome}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Mis oportunidades ----------------------------------------------- */}
        <Card
          title="Oportunidades a mi cargo"
          subtitle="Ordenadas por próxima acción."
          action={
            <Link href="/crm" className="text-xs text-brand hover:underline">
              Ver CRM
            </Link>
          }
        >
          {myLeads.length === 0 ? (
            <EmptyState title="No tenes oportunidades abiertas asignadas" />
          ) : (
            <ul className="divide-y divide-border">
              {myLeads.map((l) => {
                const overdue = l.next_action_date !== null && l.next_action_date < today;
                return (
                  <li key={l.id} className="py-2 first:pt-0">
                    <Link href={`/crm/${l.id}`} className="text-sm font-medium hover:underline">
                      {l.name}
                    </Link>
                    {l.company && <span className="ml-2 text-xs text-muted">{l.company}</span>}
                    <p className={`text-xs ${overdue ? "text-risk" : "text-faint"}`}>
                      {l.next_action
                        ? `${overdue ? "Vencida " : ""}${formatDate(l.next_action_date)} · ${l.next_action}`
                        : "Sin próxima acción definida"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Alertas y bloqueos ---------------------------------------------- */}
        <Card
          title="Lo que necesita atención"
          action={
            <Link href="/alertas" className="text-xs text-brand hover:underline">
              Ver todo
            </Link>
          }
        >
          {myAlerts.length === 0 && blockers.length === 0 ? (
            <EmptyState title="Todo en orden" detail="No hay alertas ni bloqueos abiertos para vos." />
          ) : (
            <ul className="divide-y divide-border">
              {myAlerts.map((a) => (
                <li key={a.id} className="py-2 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={a.href} className="text-sm font-medium hover:underline">
                      {a.title}
                    </Link>
                    <Badge tone={a.severity === "urgente" ? "risk" : a.severity === "atencion" ? "warn" : "neutral"}>
                      {SEVERITY_LABEL[a.severity]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">{a.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Performance del area ---------------------------------------------- */}
      <Card
        className="mt-4"
        title={`Performance del area — ${AREA_LABEL[user.area]}`}
        subtitle="Resultado agregado del area, no de cada persona."
      >
        {area.objectives.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Objetivos del area</span>
              <span className="tnum">{formatPct(area.pct)}</span>
            </div>
            <ProgressBar pct={area.pct} expectedPct={elapsed} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {areaResults.map((m) => (
            <div key={m.key} className="rounded-lg border border-border bg-surface-2 p-2.5">
              <p className="text-xs text-muted">{m.label}</p>
              <p className="tnum mt-0.5 text-lg font-semibold">{formatMetric(m.value, m.unit, cur)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Avisos ------------------------------------------------------------- */}
      {announcements.length > 0 && (
        <Card className="mt-4" title="Avisos">
          <ul className="divide-y divide-border">
            {announcements.map((a) => (
              <li key={a.id} className="py-2 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{a.title}</p>
                  <Badge tone={a.level === "urgente" ? "risk" : a.level === "importante" ? "warn" : "neutral"}>
                    {a.level}
                  </Badge>
                </div>
                {a.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{a.body}</p>}
                <p className="mt-0.5 text-xs text-faint">{formatDate(a.starts_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!can(user, "finanzas:ver") && (
        <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Este panel no incluye información financiera de la empresa (caja, margenes, costos de otras
          personas ni rentabilidad). Si necesitas algo de eso para tu trabajo, pedilo a dirección.
        </p>
      )}
    </>
  );
}
