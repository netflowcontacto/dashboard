import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { resolveRange, formatPeriod, formatDate, monthOf, todayISO } from "@/lib/dates";
import { buildOverview } from "@/lib/metrics/overview";
import { daysLeftInPeriod } from "@/lib/metrics/objectives";
import { alertsFor } from "@/lib/alerts";
import { formatMoney } from "@/lib/money";
import { teamPerformance } from "@/lib/metrics/team";
import {
  Badge, Card, EmptyState, PageHeader, ProgressBar, StatCard, formatPct,
} from "@/components/ui";
import RangePicker from "@/components/RangePicker";

export const dynamic = "force-dynamic";

/**
 * Resumen general (solo direccion).
 *
 * Ordenado para responder, de arriba hacia abajo, las tres preguntas del
 * dashboard: como esta NetFlow, donde esta el cuello de botella, y quien
 * tiene la proxima accion.
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

  const o = buildOverview(range);
  const f = o.finance;
  const alerts = alertsFor(user).filter((a) => a.severity === "urgente").slice(0, 6);
  const team = teamPerformance(range);
  const cur = f.currency;
  const daysLeft = daysLeftInPeriod(monthOf(todayISO()));

  return (
    <>
      <PageHeader
        title="Resumen general"
        description={`Estado de NetFlow — ${range.label.toLowerCase()} (${formatDate(range.from)} a ${formatDate(range.to)}).`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      {/* 1. Objetivo del mes ------------------------------------------------ */}
      <Card
        className="mb-4"
        title={`Objetivo del mes — ${formatPeriod(o.period)}`}
        action={
          <Link href="/objetivos" className="text-xs text-brand hover:underline">
            Ver objetivos
          </Link>
        }
      >
        {o.headline ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">{o.headline.label}</p>
              <p className="tnum mt-1 text-3xl font-semibold">
                {o.headline.current ?? 0}
                <span className="text-lg font-normal text-faint"> / {o.headline.target}</span>
              </p>
            </div>
            <div className="min-w-56 flex-1">
              <div className="mb-1 flex justify-between text-xs">
                <span className={o.headline.onTrack ? "text-ok" : "text-risk"}>
                  {formatPct(o.headline.pct)} cumplido
                </span>
                <span className="text-faint">
                  ritmo esperado {formatPct(o.headline.expectedPct)}
                </span>
              </div>
              <ProgressBar pct={o.headline.pct} expectedPct={o.headline.expectedPct} size="lg" />
              <p className="mt-1.5 text-xs text-muted">
                Faltan {o.headline.missing ?? 0} · quedan {daysLeft} dia(s) del mes
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Todavia no hay objetivo cargado para este mes"
            detail="Sin objetivo no hay barra de progreso: el dashboard no inventa un numero."
            action={
              <Link href="/objetivos" className="btn btn-primary">
                Cargar objetivo
              </Link>
            }
          />
        )}
      </Card>

      {/* 2. Como esta NetFlow ---------------------------------------------- */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Clientes</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes activos" value={o.clients.active} href="/clientes" />
        <StatCard
          label="Nuevos en el periodo"
          value={o.clients.newInRange}
          tone={o.clients.newInRange > 0 ? "ok" : "neutral"}
          hint={o.clients.churnedInRange > 0 ? `${o.clients.churnedInRange} baja(s)` : "Sin bajas"}
        />
        <StatCard
          label="Cuentas en atencion"
          value={o.clients.byHealth.atencion}
          tone={o.clients.byHealth.atencion > 0 ? "warn" : "neutral"}
          href="/clientes"
        />
        <StatCard
          label="Cuentas en riesgo"
          value={o.clients.byHealth.riesgo}
          tone={o.clients.byHealth.riesgo > 0 ? "risk" : "ok"}
          href="/clientes"
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Facturacion e ingresos</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatMoney(f.mrrCents, cur)}
          hint={`${f.activeClients} cliente(s) activo(s)`}
        />
        <StatCard label="Facturacion cobrada" value={formatMoney(f.collectedCents, cur)} tone="ok" />
        <StatCard
          label="Facturacion pendiente"
          value={formatMoney(f.pendingCents, cur)}
          tone={f.pendingCents > 0 ? "warn" : "neutral"}
          hint={o.clients.pendingPayment > 0 ? `${o.clients.pendingPayment} cliente(s) con cobro abierto` : undefined}
        />
        <StatCard
          label="Nuevos ingresos (MRR nuevo)"
          value={formatMoney(f.newMrrCents, cur)}
          tone={f.newMrrCents > 0 ? "ok" : "neutral"}
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Caja y resultado</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Caja disponible"
          value={formatMoney(f.cashCents, cur)}
          href="/finanzas"
          hint={
            f.runwayMonths !== null
              ? `Runway ~${f.runwayMonths.toFixed(1)} meses`
              : "Cargar gastos para estimar runway"
          }
        />
        <StatCard label="Gastos del periodo" value={formatMoney(f.totalExpensesCents, cur)} href="/finanzas" />
        <StatCard
          label="Resultado del periodo"
          value={formatMoney(f.resultCents, cur)}
          tone={f.resultCents >= 0 ? "ok" : "risk"}
          hint="Facturado − costos directos − gastos operativos"
        />
        <StatCard
          label="Margen bruto"
          value={formatPct(f.grossMarginPct, 1)}
          tone={(f.grossMarginPct ?? 0) >= 60 ? "ok" : (f.grossMarginPct ?? 0) >= 35 ? "warn" : "risk"}
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Eficiencia comercial</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="CAC"
          value={o.funnel.rates.cacCents !== null ? formatMoney(o.funnel.rates.cacCents, cur) : "—"}
          href="/funnel"
          hint="Inversion del periodo / clientes cerrados"
        />
        <StatCard
          label="Ticket promedio"
          value={f.averageTicketCents !== null ? formatMoney(f.averageTicketCents, cur) : "—"}
        />
        <StatCard
          label="CPL"
          value={o.funnel.rates.cplCents !== null ? formatMoney(o.funnel.rates.cplCents, cur) : "—"}
          href="/funnel"
        />
        <StatCard
          label="Costo operativo por cliente"
          value={
            f.operatingCostPerClientCents !== null ? formatMoney(f.operatingCostPerClientCents, cur) : "—"
          }
        />
      </div>

      {/* 3. Donde esta el cuello de botella + quien tiene la proxima accion -- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          title="Cuello de botella"
          subtitle="La conversion mas floja de la cadena en este periodo."
          action={
            <Link href="/funnel" className="text-xs text-brand hover:underline">
              Ver funnel
            </Link>
          }
        >
          {o.bottleneck ? (
            <div>
              <p className="text-sm">
                <span className="font-medium">{o.bottleneck.from}</span>
                <span className="mx-2 text-faint">→</span>
                <span className="font-medium">{o.bottleneck.to}</span>
              </p>
              <p className="tnum mt-1 text-3xl font-semibold text-risk">
                {o.bottleneck.rate.toFixed(0)}%
              </p>
              <p className="mt-1 text-xs text-muted">{o.bottleneck.detail} en el periodo.</p>
            </div>
          ) : (
            <EmptyState
              title="Sin datos suficientes"
              detail="Hacen falta leads cargados en el periodo para detectar el cuello de botella."
            />
          )}
        </Card>

        <Card
          title="Proximas acciones por responsable"
          subtitle="Quien tiene que mover cada oportunidad abierta."
          action={
            <Link href="/crm" className="text-xs text-brand hover:underline">
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
                    <th className="text-right">Proximas</th>
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
      </div>

      {/* Alertas urgentes --------------------------------------------------- */}
      <Card
        className="mt-4"
        title="Alertas urgentes"
        action={
          <Link href="/alertas" className="text-xs text-brand hover:underline">
            Ver todas
          </Link>
        }
      >
        {alerts.length === 0 ? (
          <EmptyState title="Nada urgente" detail="No hay alertas criticas abiertas." />
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={a.href} className="text-sm font-medium hover:underline">
                    {a.title}
                  </Link>
                  <p className="text-xs text-muted">{a.detail}</p>
                </div>
                {a.ownerName && <Badge tone="neutral">{a.ownerName}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Equipo — progreso contra objetivo, en orden fijo (no es un ranking) - */}
      <Card
        className="mt-4"
        title="Progreso del equipo"
        subtitle="Cada persona contra su propio objetivo. El orden es fijo: no es una tabla de posiciones."
        action={
          <Link href="/equipo" className="text-xs text-brand hover:underline">
            Ver detalle
          </Link>
        }
      >
        <ul className="space-y-3">
          {team.map((p) => (
            <li key={p.user.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
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
    </>
  );
}
