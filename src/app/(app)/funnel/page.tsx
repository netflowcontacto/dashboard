import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveRange, formatDate, plural } from "@/lib/dates";
import { computeFunnel, leadsBySource } from "@/lib/metrics/funnel";
import { findBottleneck } from "@/lib/metrics/overview";
import { formatMoney } from "@/lib/money";
import { compareMetrics, previousRange } from "@/lib/metrics/compare";
import { Card, EmptyState, Note, PageHeader, SectionTitle, StatCard, formatPct } from "@/components/ui";
import { BarList, FunnelChart, type DeltaValue } from "@/components/charts";
import RangePicker from "@/components/RangePicker";

export const dynamic = "force-dynamic";

/**
 * Funnel comercial: Pauta -> Leads -> Contactados -> Calificados ->
 * Reuniones agendadas -> Reuniones realizadas -> Propuestas -> Clientes.
 *
 * Las conversiones se miden por COHORTE (leads que ingresaron en el rango),
 * que es la única forma de que los porcentajes cierren. La actividad del
 * período se muestra aparte y etiquetada, para no mezclar las dos lecturas.
 */
export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "funnel:ver")) notFound();
  const verFacturacion = can(user, "finanzas:ver");
  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const f = await computeFunnel(range);
  const sources = await leadsBySource(range);
  const bottleneck = findBottleneck(f);
  const cur = f.currency;
  const prev = previousRange(range);
  const cmp = await compareMetrics(["leads_totales", "cpl", "inversion"], range);
  const toDelta = (key: string): DeltaValue | undefined => {
    const c = cmp[key];
    return c ? { pct: c.pct, higherIsBetter: c.higherIsBetter, vs: c.vs } : undefined;
  };

  return (
    <>
      <PageHeader
        title="Funnel comercial"
        description={`${formatDate(range.from)} a ${formatDate(range.to)}. Las conversiones se calculan sobre los leads que ingresaron en el período. Comparado contra ${prev.label}.`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Inversión publicitaria"
          value={formatMoney(f.investmentCents, cur)}
          delta={toDelta("inversion")}
        />
        <StatCard label="Leads" value={f.cohort.leads} delta={toDelta("leads_totales")} />
        <StatCard
          label="CPL"
          value={f.rates.cplCents !== null ? formatMoney(f.rates.cplCents, cur) : "—"}
          delta={toDelta("cpl")}
          hint="Menos es mejor"
        />
        <StatCard
          label="CAC"
          value={f.rates.cacCents !== null ? formatMoney(f.rates.cacCents, cur) : "—"}
          hint="Inversión / clientes cerrados en el período"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="% de contacto" value={formatPct(f.rates.contacto)} />
        <StatCard label="% de calificación" value={formatPct(f.rates.calificacion)} />
        <StatCard label="Lead → reunión" value={formatPct(f.rates.leadAReunion)} />
        <StatCard
          label="Show rate"
          value={formatPct(f.rates.showRate)}
          tone={(f.rates.showRate ?? 100) >= 70 ? "ok" : (f.rates.showRate ?? 0) >= 50 ? "warn" : "risk"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reunión → propuesta" value={formatPct(f.rates.reunionAPropuesta)} />
        <StatCard label="Reunión → cliente" value={formatPct(f.rates.reunionACliente)} />
        {verFacturacion && (
          <StatCard label="Revenue generado (MRR nuevo)" value={formatMoney(f.revenueCents, cur)} tone="ok" />
        )}
        <StatCard label="Clientes cerrados" value={f.cohort.clientes} tone="ok" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Cadena de conversión"
          subtitle="Cohorte: leads que ingresaron en el período y hasta dónde llegaron."
        >
          {f.cohort.leads === 0 ? (
            <EmptyState
              title="Sin leads en este período"
              detail="Cargá oportunidades en el CRM o ampliá el rango de fechas."
            />
          ) : (
            <FunnelChart
              stages={f.stages.map((s, i) => ({
                key: s.key,
                label: s.label,
                value: s.value,
                stepRate: s.stepRate,
                totalRate: s.totalRate,
                isBottleneck:
                  bottleneck !== null &&
                  i > 0 &&
                  f.stages[i - 1].label === bottleneck.from &&
                  s.label === bottleneck.to,
              }))}
            />
          )}
          {bottleneck && (
            <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
              <strong className="text-text">Cuello de botella:</strong> {bottleneck.from} →{" "}
              {bottleneck.to} ({bottleneck.rate.toFixed(0)}%, {bottleneck.detail}). Es el paso donde
              más se pierde: mover esa conversión es lo que más mueve el mes.
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Actividad del período" subtitle="Qué pasó en estas fechas, sin importar cuándo entró el lead.">
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

          <Card title="Origen de los leads" subtitle="De dónde viene el volumen real.">
            {sources.length === 0 ? (
              <EmptyState title="Sin datos" />
            ) : (
              <BarList
                rows={sources.map((src) => ({
                  key: src.source,
                  label: src.source.replace(/_/g, " "),
                  value: src.leads,
                  hint: src.clientes > 0 ? `${src.clientes} cierre(s)` : undefined,
                }))}
                format={{ kind: "numero" }}
              />
            )}
          </Card>
        </div>
      </div>
      <Note>
        La <strong>cadena de conversión</strong> mide la cohorte que ingresó en el rango, por eso
        los porcentajes nunca pasan del 100%. La <strong>actividad del período</strong> cuenta lo
        que pasó en estas fechas sin importar cuándo entró el lead. Son dos lecturas distintas a
        propósito: mezclarlas es lo que hace que un funnel muestre «120% de contacto».
      </Note>
    </>
  );
}
