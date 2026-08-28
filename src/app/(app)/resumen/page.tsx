import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { resolveRange, formatPeriod, formatDate, monthOf, todayISO } from "@/lib/dates";
import { buildOverview } from "@/lib/metrics/overview";
import { daysLeftInPeriod } from "@/lib/metrics/objectives";
import { compareMetrics, metricHistory, previousRange, MONTH_SHORT } from "@/lib/metrics/compare";
import { financeSummary, monthlyTrend } from "@/lib/metrics/finance";
import { alertsFor } from "@/lib/alerts";
import { setupStatus } from "@/lib/setup";
import { formatMoney } from "@/lib/money";
import { teamPerformance } from "@/lib/metrics/team";
import {
  Badge, Card, EmptyState, HeroStat, Note, PageHeader, ProgressBar,
  SectionTitle, StatCard, formatPct,
} from "@/components/ui";
import { BarList, ColumnsChart, type DeltaValue } from "@/components/charts";
import RangePicker from "@/components/RangePicker";
import SetupChecklist from "./SetupChecklist";

export const dynamic = "force-dynamic";

/**
 * Resumen general (solo dirección).
 *
 * Ordenado para responder, de arriba hacia abajo, las tres preguntas del
 * dashboard: cómo está NetFlow, dónde está el cuello de botella, y quién
 * tiene la próxima acción.
 *
 * La jerarquía es deliberada: una sola cifra protagonista arriba, después
 * las tarjetas de apoyo. Si todo se ve igual de importante, nada lo es.
 */
export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const today = todayISO();
  const o = buildOverview(range);
  const f = o.finance;
  const prev = previousRange(range);
  const prevFinance = financeSummary(prev);
  const alerts = alertsFor(user).filter((a) => a.severity === "urgente").slice(0, 5);
  const team = teamPerformance(range);
  const setup = setupStatus();
  const cur = f.currency;
  const daysLeft = daysLeftInPeriod(monthOf(today));

  const cmp = compareMetrics(
    ["clientes_nuevos", "clientes_activos", "leads_totales", "mrr_total", "ingresos_cobrados"],
    range,
  );

  /** Delta de un importe financiero que no está en el registro de métricas. */
  const moneyDelta = (current: number, previous: number, higherIsBetter = true): DeltaValue => ({
    pct: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100,
    higherIsBetter,
    vs: prev.label,
  });

  const toDelta = (key: string): DeltaValue | undefined => {
    const c = cmp[key];
    return c ? { pct: c.pct, higherIsBetter: c.higherIsBetter, vs: c.vs } : undefined;
  };

  const histClientes = metricHistory("clientes_activos", 6, range.to);
  const histLeads = metricHistory("leads_totales", 6, range.to);
  const histMrr = metricHistory("mrr_total", 6, range.to);

  const trend = monthlyTrend(6, range.to);
  const expensesByCat = o.funnel.investmentCents;

  return (
    <>
      <PageHeader
        title="Resumen general"
        description={`${range.label} · ${formatDate(range.from)} a ${formatDate(range.to)}. Comparado contra ${prev.label}.`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <SetupChecklist status={setup} />

      {/* ── 1. ¿Cómo está NetFlow? Una sola cifra protagonista ────────────── */}
      <Card
        className="mb-5"
        title={`Objetivo del mes — ${formatPeriod(o.period)}`}
        action={
          <Link href="/objetivos" className="btn btn-ghost btn-sm text-brand-ink">
            Ver objetivos
          </Link>
        }
      >
        {o.headline ? (
          <HeroStat
            label={o.headline.label}
            value={
              <>
                {o.headline.current ?? 0}
                <span className="text-2xl font-normal text-faint"> / {o.headline.target}</span>
              </>
            }
            delta={toDelta("clientes_nuevos")}
            sub={`Faltan ${o.headline.missing ?? 0} · quedan ${daysLeft} día(s) del mes`}
          >
            <div className="mb-1.5 flex justify-between text-xs">
              <span className={o.headline.onTrack ? "font-medium text-ok" : "font-medium text-risk"}>
                {formatPct(o.headline.pct)} cumplido
              </span>
              <span className="text-faint">ritmo esperado {formatPct(o.headline.expectedPct)}</span>
            </div>
            <ProgressBar pct={o.headline.pct} expectedPct={o.headline.expectedPct} size="lg" />
            <p className="mt-2 text-xs text-faint">
              La marca vertical es el ritmo que correspondería a esta altura del mes.
            </p>
          </HeroStat>
        ) : (
          <EmptyState
            title="Todavía no hay objetivo cargado para este mes"
            detail="Sin objetivo no hay barra de progreso: el dashboard no inventa un número."
            action={
              <Link href="/objetivos" className="btn btn-primary">
                Cargar objetivo
              </Link>
            }
          />
        )}
      </Card>

      <SectionTitle>Clientes e ingresos</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Clientes activos"
          value={o.clients.active}
          href="/clientes"
          delta={toDelta("clientes_activos")}
          spark={histClientes.map((h) => ({ label: h.label, value: h.value }))}
        />
        <StatCard
          label="MRR"
          value={formatMoney(f.mrrCents, cur)}
          delta={moneyDelta(f.mrrCents, prevFinance.mrrCents)}
          spark={histMrr.map((h) => ({ label: h.label, value: Math.round(h.value) }))}
        />
        <StatCard
          label="Facturación cobrada"
          value={formatMoney(f.collectedCents, cur)}
          tone="ok"
          delta={moneyDelta(f.collectedCents, prevFinance.collectedCents)}
        />
        <StatCard
          label="Facturación pendiente"
          value={formatMoney(f.pendingCents, cur)}
          tone={f.pendingCents > 0 ? "warn" : "neutral"}
          hint={
            o.clients.pendingPayment > 0
              ? `${o.clients.pendingPayment} cliente(s) con cobro abierto`
              : "Todos los cobros al día"
          }
        />
      </div>

      <SectionTitle>Caja y resultado</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Caja disponible"
          value={formatMoney(f.cashCents, cur)}
          href="/finanzas"
          hint={
            f.runwayMonths !== null
              ? `Runway ~${f.runwayMonths.toFixed(1)} meses`
              : "Cargá gastos para estimar el runway"
          }
        />
        <StatCard
          label="Gastos del período"
          value={formatMoney(f.totalExpensesCents, cur)}
          href="/finanzas"
          delta={moneyDelta(f.totalExpensesCents, prevFinance.totalExpensesCents, false)}
        />
        <StatCard
          label="Resultado del período"
          value={formatMoney(f.resultCents, cur)}
          tone={f.resultCents >= 0 ? "ok" : "risk"}
          hint="Facturado − costos directos − gastos operativos"
          delta={moneyDelta(f.resultCents, prevFinance.resultCents)}
        />
        <StatCard
          label="Margen bruto"
          value={formatPct(f.grossMarginPct, 1)}
          tone={(f.grossMarginPct ?? 0) >= 60 ? "ok" : (f.grossMarginPct ?? 0) >= 35 ? "warn" : "risk"}
          hint={`Margen neto ${formatPct(f.netMarginPct, 1)}`}
        />
      </div>

      <SectionTitle>Eficiencia comercial</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Leads del período"
          value={o.funnel.cohort.leads}
          href="/funnel"
          delta={toDelta("leads_totales")}
          spark={histLeads.map((h) => ({ label: h.label, value: h.value }))}
        />
        <StatCard
          label="CAC"
          value={o.funnel.rates.cacCents !== null ? formatMoney(o.funnel.rates.cacCents, cur) : "—"}
          href="/funnel"
          hint="Inversión del período / clientes cerrados"
        />
        <StatCard
          label="CPL"
          value={o.funnel.rates.cplCents !== null ? formatMoney(o.funnel.rates.cplCents, cur) : "—"}
          href="/funnel"
          hint={`Inversión ${formatMoney(expensesByCat, cur)}`}
        />
        <StatCard
          label="Ticket promedio"
          value={f.averageTicketCents !== null ? formatMoney(f.averageTicketCents, cur) : "—"}
          hint={`Costo operativo por cliente ${
            f.operatingCostPerClientCents !== null ? formatMoney(f.operatingCostPerClientCents, cur) : "—"
          }`}
        />
      </div>

      {/* ── 2. ¿Dónde está el cuello de botella? ──────────────────────────── */}
      <SectionTitle>Dónde está el cuello de botella</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Conversión más floja"
          subtitle="El paso del embudo que más está frenando el mes."
          action={
            <Link href="/funnel" className="btn btn-ghost btn-sm text-brand-ink">
              Ver funnel
            </Link>
          }
        >
          {o.bottleneck ? (
            <>
              <p className="text-sm text-muted">
                <span className="font-medium text-text">{o.bottleneck.from}</span>
                <span className="mx-1.5 text-faint">→</span>
                <span className="font-medium text-text">{o.bottleneck.to}</span>
              </p>
              <p className="mt-1.5 text-4xl font-semibold leading-none text-risk">
                {o.bottleneck.rate.toFixed(0)}%
              </p>
              <p className="mt-2 text-xs text-muted">{o.bottleneck.detail} en el período.</p>
            </>
          ) : (
            <EmptyState
              title="Sin datos suficientes"
              detail="Hacen falta leads cargados en el período para detectar el cuello de botella."
            />
          )}
        </Card>

        <Card
          className="lg:col-span-2"
          title="Embudo del período"
          subtitle="Leads que ingresaron en el rango y hasta dónde llegaron."
        >
          {o.funnel.cohort.leads === 0 ? (
            <EmptyState title="Sin leads en este período" />
          ) : (
            <BarList
              rows={o.funnel.stages.map((s) => ({
                key: s.key,
                label: s.label,
                value: s.value,
                critical:
                  o.bottleneck !== null &&
                  s.label === o.bottleneck.to &&
                  s.stepRate === o.bottleneck.rate,
                hint: s.totalRate !== null && s.key !== "leads" ? `${s.totalRate.toFixed(0)}%` : undefined,
              }))}
              format={{ kind: "numero" }}
            />
          )}
        </Card>
      </div>

      {/* ── 3. ¿Quién tiene la próxima acción? ────────────────────────────── */}
      <SectionTitle>Quién tiene la próxima acción</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Oportunidades abiertas por responsable"
          action={
            <Link href="/crm" className="btn btn-ghost btn-sm text-brand-ink">
              Ver CRM
            </Link>
          }
        >
          {o.nextActions.length === 0 ? (
            <EmptyState title="No hay oportunidades abiertas" />
          ) : (
            <div className="scroll-x">
              <table className="nf">
                <thead>
                  <tr>
                    <th>Responsable</th>
                    <th className="text-right">Vencidas</th>
                    <th className="text-right">Hoy</th>
                    <th className="text-right">Próximas</th>
                    <th className="text-right">Sin definir</th>
                  </tr>
                </thead>
                <tbody>
                  {o.nextActions.map((r) => (
                    <tr key={r.ownerId}>
                      <td className="font-medium">{r.ownerName}</td>
                      <td className="tnum text-right">
                        {r.overdue > 0 ? <Badge tone="risk">{r.overdue}</Badge> : "0"}
                      </td>
                      <td className="tnum text-right">{r.today}</td>
                      <td className="tnum text-right text-muted">{r.upcoming}</td>
                      <td className="tnum text-right">
                        {r.missing > 0 ? <Badge tone="warn">{r.missing}</Badge> : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Alertas urgentes"
          action={
            <Link href="/alertas" className="btn btn-ghost btn-sm text-brand-ink">
              Ver todas
            </Link>
          }
        >
          {alerts.length === 0 ? (
            <EmptyState title="Nada urgente" detail="No hay alertas críticas abiertas." />
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={a.href} className="text-sm font-medium hover:underline">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-xs leading-snug text-muted">{a.detail}</p>
                  </div>
                  {a.ownerName && <Badge tone="neutral">{a.ownerName}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <SectionTitle>Tendencia</SectionTitle>
      <Card title="Facturado vs gastos" subtitle="Últimos 6 meses, consolidado en la moneda base.">
        <ColumnsChart
          labels={trend.map((t) => MONTH_SHORT[Number(t.period.slice(5, 7)) - 1])}
          series={[
            { key: "facturado", label: "Facturado", slot: 1, values: trend.map((t) => t.billedCents) },
            { key: "gastos", label: "Gastos", slot: 2, values: trend.map((t) => t.expensesCents) },
          ]}
          format={{ kind: "moneda", currency: cur }}
          height={170}
        />
      </Card>

      <SectionTitle>Progreso del equipo</SectionTitle>
      <Card
        subtitle="Cada persona contra su propio objetivo. El orden es fijo: no es una tabla de posiciones."
        title="Cumplimiento individual"
        action={
          <Link href="/equipo" className="btn btn-ghost btn-sm text-brand-ink">
            Ver detalle
          </Link>
        }
      >
        <ul className="space-y-3.5">
          {team.map((p) => (
            <li key={p.user.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  {p.user.name}
                  <span className="ml-2 text-xs font-normal text-faint">{p.user.job_title}</span>
                </span>
                <span className="tnum text-xs text-muted">
                  {p.progress.pct === null ? "sin objetivos" : formatPct(p.progress.pct)}
                </span>
              </div>
              <ProgressBar
                pct={p.progress.pct}
                expectedPct={p.progress.expectedPct}
                emptyLabel="Sin objetivos cargados para este mes"
              />
            </li>
          ))}
        </ul>
      </Card>

      <Note>
        Los porcentajes de conversión se calculan sobre los leads que ingresaron en el período
        (cohorte), así nunca superan el 100%. Las comparaciones son contra {prev.label}: cuando no
        hay base previa, el dashboard dice «sin base de comparación» en lugar de inventar un salto.
      </Note>
    </>
  );
}
