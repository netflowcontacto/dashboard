import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { monthOf, todayISO, formatPeriod } from "@/lib/dates";
import {
  activeUsers, areaProgress, companyProgress, daysLeftInPeriod, listObjectives,
  periodElapsedPct, personProgress, progressFor, type ObjectiveProgress,
} from "@/lib/metrics/objectives";
import { METRICS } from "@/lib/metrics/registry";
import { baseCurrency } from "@/lib/fx";
import { AREA_LABEL, type Area } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatCard, formatMetric, formatPct } from "@/components/ui";
import ObjectiveForm from "./ObjectiveForm";
import DeleteObjective from "./DeleteObjective";

export const dynamic = "force-dynamic";

function ObjectiveTable({
  rows,
  canDelete,
}: {
  rows: ObjectiveProgress[];
  canDelete: boolean;
}) {
  const cur = baseCurrency();
  return (
    <div className="scroll-x">
      <table className="nf">
        <thead>
          <tr>
            <th>Objetivo</th>
            <th className="text-right">Resultado</th>
            <th className="text-right">Meta</th>
            <th className="text-right">Cumplimiento</th>
            <th className="w-40">Progreso</th>
            <th className="text-right">Falta</th>
            {canDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.objective.id}>
              <td className="font-medium">{r.label}</td>
              <td className="tnum text-right">{formatMetric(r.current, r.unit, cur)}</td>
              <td className="tnum text-right text-muted">{formatMetric(r.target, r.unit, cur)}</td>
              <td className="tnum text-right">
                <Badge tone={r.onTrack ? "ok" : "risk"}>{formatPct(r.pct)}</Badge>
              </td>
              <td>
                <ProgressBar pct={r.pct} expectedPct={r.expectedPct} size="sm" />
              </td>
              <td className="tnum text-right text-muted">
                {r.missing === null ? "—" : formatMetric(r.missing, r.unit, cur)}
              </td>
              {canDelete && (
                <td className="text-right">
                  <DeleteObjective id={r.objective.id} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ObjetivosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const period = /^\d{4}-\d{2}$/.test(String(sp.período ?? "")) ? String(sp.período) : monthOf(today);

  const editar = can(user, "objetivos:cargar");
  const verTodos = can(user, "equipo:ver_todos");

  const company = companyProgress(period, today);
  const elapsed = periodElapsedPct(period, today);
  const daysLeft = daysLeftInPeriod(period, today);

  const areas = (Object.keys(AREA_LABEL) as Area[])
    .map((a) => ({ area: a, progress: areaProgress(a, period, today) }))
    .filter((a) => a.progress.objectives.length > 0);

  // El equipo ve solo sus propios objetivos individuales. Dirección ve todos,
  // pero en orden fijo por persona: no es un ranking.
  const people = (verTodos ? activeUsers() : activeUsers().filter((u) => u.id === user.id)).map((u) => ({
    user: u,
    progress: personProgress(u.id, period, today),
  }));

  const metrics = METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    unit: m.unit,
    scope: m.scope,
    higherIsBetter: m.higherIsBetter,
  }));

  return (
    <>
      <PageHeader
        title="Objetivos"
        description={`${formatPeriod(period)} · ${daysLeft} día(s) restantes · ${Math.round(elapsed)}% del período transcurrido.`}
      >
        <form className="flex items-end gap-2">
          <input
            name="período"
            defaultValue={period}
            pattern="\d{4}-\d{2}"
            className="field w-32 py-1.5 text-sm"
            aria-label="Período"
          />
          <button type="submit" className="btn py-1.5 text-sm">
            Ver período
          </button>
        </form>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Cumplimiento general"
          value={company.pct === null ? "sin objetivos" : formatPct(company.pct)}
          tone={company.pct === null ? "neutral" : company.status === "atrasado" ? "risk" : "ok"}
        />
        <StatCard label="Ritmo esperado" value={formatPct(elapsed)} hint="Según los días del período" />
        <StatCard label="Días restantes" value={daysLeft} />
        <StatCard label="Objetivos cargados" value={listObjectives(period).length} />
      </div>

      <Card className="mt-4" title="Objetivos de empresa">
        {company.objectives.length === 0 ? (
          <EmptyState
            title="Sin objetivos de empresa para este período"
            detail="El primero debería ser el objetivo general del mes: clientes nuevos."
          />
        ) : (
          <>
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">Progreso general</span>
                <span className="tnum text-muted">{formatPct(company.pct)}</span>
              </div>
              <ProgressBar pct={company.pct} expectedPct={elapsed} size="lg" />
            </div>
            <ObjectiveTable rows={company.objectives} canDelete={editar} />
          </>
        )}
      </Card>

      {areas.length > 0 && (
        <Card className="mt-4" title="Objetivos por area">
          <div className="space-y-6">
            {areas.map(({ area, progress }) => (
              <div key={area}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{AREA_LABEL[area]}</h3>
                  <span className="tnum text-xs text-muted">{formatPct(progress.pct)}</span>
                </div>
                <ObjectiveTable rows={progress.objectives} canDelete={editar} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        className="mt-4"
        title={verTodos ? "Objetivos individuales" : "Mis objetivos"}
        subtitle={
          verTodos
            ? "Cada persona contra su propio objetivo. El orden es fijo y no hay comparación entre personas."
            : undefined
        }
      >
        <div className="space-y-6">
          {people.map(({ user: person, progress }) =>
            progress.objectives.length === 0 ? (
              <div key={person.id}>
                <h3 className="text-sm font-medium">
                  {person.name}
                  <span className="ml-2 text-xs font-normal text-faint">{AREA_LABEL[person.area]}</span>
                </h3>
                <p className="mt-1 text-xs text-faint">Sin objetivos cargados para este período.</p>
              </div>
            ) : (
              <div key={person.id}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">
                    {person.name}
                    <span className="ml-2 text-xs font-normal text-faint">{AREA_LABEL[person.area]}</span>
                  </h3>
                  <span className="tnum text-xs text-muted">{formatPct(progress.pct)}</span>
                </div>
                <ObjectiveTable rows={progress.objectives} canDelete={editar} />
              </div>
            ),
          )}
        </div>
      </Card>

      {editar && (
        <Card
          className="mt-4"
          title="Cargar objetivo"
          subtitle="El resultado nunca se carga a mano: se calcula desde el CRM, clientes, tareas y finanzas."
        >
          <ObjectiveForm metrics={metrics} users={activeUsers()} period={period} />
        </Card>
      )}
    </>
  );
}
