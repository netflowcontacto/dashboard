import { requireAdmin } from "@/lib/auth";
import { resolveRange, formatDate } from "@/lib/dates";
import { computeFunnel, leadsBySource } from "@/lib/metrics/funnel";
import { findBottleneck } from "@/lib/metrics/overview";
import { formatMoney } from "@/lib/money";
import { Card, EmptyState, PageHeader, StatCard, formatPct } from "@/components/ui";
import RangePicker from "@/components/RangePicker";

export const dynamic = "force-dynamic";

/**
 * Funnel comercial: Pauta -> Leads -> Contactados -> Calificados ->
 * Reuniones agendadas -> Reuniones realizadas -> Propuestas -> Clientes.
 *
 * Las conversiones se miden por COHORTE (leads que ingresaron en el rango),
 * que es la unica forma de que los porcentajes cierren. La actividad del
 * periodo se muestra aparte y etiquetada, para no mezclar las dos lecturas.
 */
export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const f = computeFunnel(range);
  const sources = leadsBySource(range);
  const bottleneck = findBottleneck(f);
  const cur = f.currency;
  const maxValue = Math.max(...f.stages.map((s) => s.value), 1);

  return (
    <>
      <PageHeader
        title="Funnel comercial"
        description={`${formatDate(range.from)} a ${formatDate(range.to)}. Las conversiones se calculan sobre los leads que ingresaron en el periodo.`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Inversion publicitaria" value={formatMoney(f.investmentCents, cur)} />
        <StatCard label="Leads" value={f.cohort.leads} />
        <StatCard
          label="CPL"
          value={f.rates.cplCents !== null ? formatMoney(f.rates.cplCents, cur) : "—"}
        />
        <StatCard
          label="CAC"
          value={f.rates.cacCents !== null ? formatMoney(f.rates.cacCents, cur) : "—"}
          hint="Inversion / clientes cerrados en el periodo"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="% de contacto" value={formatPct(f.rates.contacto)} />
        <StatCard label="% de calificacion" value={formatPct(f.rates.calificacion)} />
        <StatCard label="Lead → reunion" value={formatPct(f.rates.leadAReunion)} />
        <StatCard
          label="Show rate"
          value={formatPct(f.rates.showRate)}
          tone={(f.rates.showRate ?? 100) >= 70 ? "ok" : (f.rates.showRate ?? 0) >= 50 ? "warn" : "risk"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reunion → propuesta" value={formatPct(f.rates.reunionAPropuesta)} />
        <StatCard label="Reunion → cliente" value={formatPct(f.rates.reunionACliente)} />
        <StatCard label="Revenue generado (MRR nuevo)" value={formatMoney(f.revenueCents, cur)} tone="ok" />
        <StatCard label="Clientes cerrados" value={f.cohort.clientes} tone="ok" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Cadena de conversion"
          subtitle="Cohorte: leads que ingresaron en el periodo y hasta donde llegaron."
        >
          {f.cohort.leads === 0 ? (
            <EmptyState
              title="Sin leads en este periodo"
              detail="Carga oportunidades en el CRM o ampliá el rango de fechas."
            />
          ) : (
            <ul className="space-y-2.5">
              {f.stages.map((s, i) => {
                const isBottleneck =
                  bottleneck !== null && i > 0 && f.stages[i - 1].label === bottleneck.from && s.label === bottleneck.to;
                return (
                  <li key={s.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="tnum text-xs text-muted">
                        {s.value}
                        {s.stepRate !== null && (
                          <span className={isBottleneck ? "ml-2 font-semibold text-risk" : "ml-2 text-faint"}>
                            {s.stepRate.toFixed(0)}% del paso anterior
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-6 w-full overflow-hidden rounded-md bg-surface-2">
                      <div
                        className="flex h-6 items-center rounded-md px-2 text-xs font-medium text-white transition-[width] duration-500"
                        style={{
                          width: `${Math.max(2, (s.value / maxValue) * 100)}%`,
                          background: isBottleneck ? "var(--risk)" : "var(--brand)",
                        }}
                      >
                        {s.totalRate !== null && s.value / maxValue > 0.18 && (
                          <span className="tnum">{s.totalRate.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {bottleneck && (
            <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              <strong className="text-text">Cuello de botella:</strong> {bottleneck.from} → {bottleneck.to} (
              {bottleneck.rate.toFixed(0)}%, {bottleneck.detail}).
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Actividad del periodo" subtitle="Que paso en estas fechas, sin importar cuando entro el lead.">
            <dl className="space-y-2 text-sm">
              {[
                ["Reuniones agendadas", f.activity.reunionesAgendadas],
                ["Reuniones realizadas", f.activity.reunionesRealizadas],
                ["No-shows", f.activity.noShows],
                ["Propuestas enviadas", f.activity.propuestas],
                ["Clientes cerrados", f.activity.clientes],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tnum font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Origen de los leads">
            {sources.length === 0 ? (
              <EmptyState title="Sin datos" />
            ) : (
              <table className="nf">
                <thead>
                  <tr>
                    <th>Origen</th>
                    <th className="text-right">Leads</th>
                    <th className="text-right">Cierres</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source}>
                      <td>{s.source}</td>
                      <td className="tnum text-right">{s.leads}</td>
                      <td className="tnum text-right">{s.clientes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
