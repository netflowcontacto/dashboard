import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveRange, monthOf, formatPeriod } from "@/lib/dates";
import { teamPerformance } from "@/lib/metrics/team";
import { baseCurrency } from "@/lib/fx";
import { AREA_LABEL } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, formatMetric, formatPct } from "@/components/ui";
import RangePicker from "@/components/RangePicker";

export const dynamic = "force-dynamic";

/**
 * Equipo y performance.
 *
 * Decisión de producto explicita: esta página NO es una tabla de posiciones.
 *
 *   - Las personas aparecen en orden fijo (por id), nunca ordenadas por
 *     porcentaje de cumplimiento.
 *   - Cada barra compara a la persona con SU objetivo, no con el resto.
 *   - Quien no tiene objetivos cargados aparece como "sin objetivos", no
 *     como 0%: la falta de datos no se muestra como bajo rendimiento.
 *
 * Ver docs/decisiones.md. Si en algun momento hace falta ordenar esta lista,
 * conviene discutir antes que implementar: el incentivo que genera un ranking
 * público entre compañeros con funciones distintas no es el que buscamos.
 */
export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "equipo:ver_todos")) {
    return (
      <>
        <PageHeader title="Equipo" />
        <EmptyState
          title="Esta vista es de direccion"
          detail="Podes ver tus propios resultados y los de tu area en Mi panel."
          action={
            <Link href="/mi-panel" className="btn btn-primary">
              Ir a Mi panel
            </Link>
          }
        />
      </>
    );
  }

  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const team = teamPerformance(range);
  const period = monthOf(range.to);
  const cur = baseCurrency();

  return (
    <>
      <PageHeader
        title="Equipo y performance"
        description={`Resultados de ${formatPeriod(period)}. Cada persona se mide contra su propio objetivo: esto no es un ranking.`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <div className="space-y-4">
        {team.map((p) => (
          <Card
            key={p.user.id}
            title={
              <span>
                {p.user.name}
                <span className="ml-2 text-xs font-normal text-faint">
                  {p.user.job_title || AREA_LABEL[p.user.area]}
                </span>
              </span>
            }
            subtitle={AREA_LABEL[p.user.area]}
            action={
              <Badge
                tone={
                  p.progress.pct === null
                    ? "neutral"
                    : p.progress.status === "atrasado"
                      ? "risk"
                      : p.progress.status === "adelantado"
                        ? "ok"
                        : "brand"
                }
              >
                {p.progress.pct === null ? "sin objetivos" : formatPct(p.progress.pct)}
              </Badge>
            }
          >
            <div className="mb-4">
              <ProgressBar
                pct={p.progress.pct}
                expectedPct={p.progress.expectedPct}
                size="lg"
                emptyLabel="Sin objetivos cargados: no se calcula progreso."
              />
              {p.progress.pct !== null && (
                <p className="mt-1.5 text-xs text-muted">
                  Ritmo esperado {formatPct(p.progress.expectedPct)} · quedan {p.progress.daysLeft} día(s).
                </p>
              )}
            </div>

            {p.progress.objectives.length > 0 && (
              <div className="mb-4 scroll-x">
                <table className="nf">
                  <thead>
                    <tr>
                      <th>Objetivo del mes</th>
                      <th className="text-right">Resultado</th>
                      <th className="text-right">Meta</th>
                      <th className="w-32">Progreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.progress.objectives.map((o) => (
                      <tr key={o.objective.id}>
                        <td>{o.label}</td>
                        <td className="tnum text-right font-medium">{formatMetric(o.current, o.unit, cur)}</td>
                        <td className="tnum text-right text-muted">{formatMetric(o.target, o.unit, cur)}</td>
                        <td>
                          <ProgressBar pct={o.pct} expectedPct={o.expectedPct} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                Métricas de la función (informativas, no puntuan)
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {p.metrics.map((m) => (
                  <div key={m.key} className="rounded-lg border border-border bg-surface-2 p-2.5">
                    <p className="text-xs text-muted">{m.label}</p>
                    <p className="tnum mt-0.5 text-lg font-semibold">{formatMetric(m.value, m.unit, cur)}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        Las métricas de cada función se muestran para entender el trabajo, no para puntuar. Lo único que
        alimenta la barra son los objetivos cargados en{" "}
        <Link href="/objetivos" className="text-brand hover:underline">
          Objetivos
        </Link>
        , de modo que nadie llegue al 100% acumulando tareas irrelevantes.
      </p>
    </>
  );
}
