import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { resolveRange, formatDate, todayISO } from "@/lib/dates";
import { financeSummary, expensesByCategory, marginByClient, monthlyTrend } from "@/lib/metrics/finance";
import { formatMoney } from "@/lib/money";
import { fxRate, baseCurrency } from "@/lib/fx";
import { clientsList } from "@/lib/queries";
import { EXPENSE_CATEGORY_LABEL, type Currency, type ExpenseCategory } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, StatCard, formatPct } from "@/components/ui";
import RangePicker from "@/components/RangePicker";
import ExpenseForm, { CashForm } from "./ExpenseForm";

export const dynamic = "force-dynamic";

/**
 * Finanzas — SOLO DIRECCION.
 * requireAdmin() es el control real: aunque alguien adivine la URL, no entra.
 */
export default async function FinanzasPage({
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

  const f = financeSummary(range);
  const byCategory = expensesByCategory(range);
  const margins = marginByClient(range);
  const trend = monthlyTrend(6, range.to);
  const cur = f.currency;
  const today = todayISO();

  const expenses = getDb()
    .prepare(
      `SELECT e.*, c.name AS client_name FROM expenses e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.date BETWEEN ? AND ? ORDER BY e.date DESC, e.id DESC LIMIT 100`,
    )
    .all(range.from, range.to) as {
      id: number; concept: string; category: ExpenseCategory; amount_cents: number; currency: Currency;
      date: string; cost_type: string; recurrence: string; vendor: string; status: string;
      client_name: string | null; direct_cost: number;
    }[];

  const maxTrend = Math.max(...trend.flatMap((t) => [t.billedCents, t.expensesCents]), 1);

  return (
    <>
      <PageHeader
        title="Finanzas"
        description={`Informacion sensible: visible unicamente para direccion. Consolidado en ${cur} al tipo de cambio de referencia (1 USD = ${fxRate()} ARS).`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Facturado" value={formatMoney(f.billedCents, cur)} />
        <StatCard label="Cobrado" value={formatMoney(f.collectedCents, cur)} tone="ok" />
        <StatCard
          label="Pendiente de cobro"
          value={formatMoney(f.pendingCents, cur)}
          tone={f.pendingCents > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Resultado"
          value={formatMoney(f.resultCents, cur)}
          tone={f.resultCents >= 0 ? "ok" : "risk"}
          hint="Facturado − costos directos − gastos operativos"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Costos directos" value={formatMoney(f.directCostsCents, cur)} />
        <StatCard label="Gastos operativos" value={formatMoney(f.operatingExpensesCents, cur)} />
        <StatCard label="Costos fijos" value={formatMoney(f.fixedCostsCents, cur)} />
        <StatCard label="Costos variables" value={formatMoney(f.variableCostsCents, cur)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Caja disponible"
          value={formatMoney(f.cashCents, cur)}
          tone={f.cashCents > 0 ? "neutral" : "risk"}
        />
        <StatCard label="Burn mensual" value={formatMoney(f.burnPerMonthCents, cur)} hint="Promedio 3 meses" />
        <StatCard
          label="Runway"
          value={f.runwayMonths !== null ? `${f.runwayMonths.toFixed(1)} meses` : "—"}
          tone={f.runwayMonths === null ? "neutral" : f.runwayMonths >= 6 ? "ok" : f.runwayMonths >= 3 ? "warn" : "risk"}
        />
        <StatCard
          label="Margen bruto"
          value={formatPct(f.grossMarginPct, 1)}
          tone={(f.grossMarginPct ?? 0) >= 60 ? "ok" : "warn"}
          hint={`Margen neto ${formatPct(f.netMarginPct, 1)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR" value={formatMoney(f.mrrCents, cur)} hint={`${f.activeClients} cliente(s)`} />
        <StatCard label="MRR nuevo" value={formatMoney(f.newMrrCents, cur)} tone="ok" />
        <StatCard
          label="Costo operativo por cliente"
          value={f.operatingCostPerClientCents !== null ? formatMoney(f.operatingCostPerClientCents, cur) : "—"}
        />
        <StatCard
          label="Gastos impagos del periodo"
          value={formatMoney(f.unpaidExpensesCents, cur)}
          tone={f.unpaidExpensesCents > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Gastos por categoria" subtitle="Donde se va la plata en este periodo.">
          {byCategory.length === 0 ? (
            <EmptyState title="Sin gastos cargados en el periodo" />
          ) : (
            <ul className="space-y-2">
              {byCategory.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{EXPENSE_CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category}</span>
                    <span className="tnum text-muted">
                      {formatMoney(c.totalCents, cur)}{" "}
                      <span className="text-faint">({c.pctOfTotal.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-1.5 rounded-full bg-brand" style={{ width: `${c.pctOfTotal}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tendencia 6 meses" subtitle="Facturado vs gastos, consolidado.">
          <ul className="space-y-2">
            {trend.map((t) => (
              <li key={t.period}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">{t.period}</span>
                  <span className={`tnum ${t.resultCents >= 0 ? "text-ok" : "text-risk"}`}>
                    {formatMoney(t.resultCents, cur)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className="h-2 rounded-sm bg-ok" style={{ width: `${(t.billedCents / maxTrend) * 100}%` }} />
                </div>
                <div className="mt-0.5 flex gap-1">
                  <div className="h-2 rounded-sm bg-risk" style={{ width: `${(t.expensesCents / maxTrend) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">
            <span className="text-ok">Barra superior</span>: facturado ·{" "}
            <span className="text-risk">barra inferior</span>: gastos.
          </p>
        </Card>
      </div>

      <Card className="mt-4" title="Margen por cliente" subtitle="Fee mensual menos los costos directos imputados a esa cuenta.">
        {margins.length === 0 ? (
          <EmptyState title="Sin clientes activos" />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="text-right">Fee</th>
                  <th className="text-right">Costos imputados</th>
                  <th className="text-right">Margen</th>
                  <th className="text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {margins.map((m) => (
                  <tr key={m.clientId}>
                    <td className="font-medium">{m.name}</td>
                    <td className="tnum text-right">{formatMoney(m.feeCents, cur)}</td>
                    <td className="tnum text-right text-muted">{formatMoney(m.directCostCents, cur)}</td>
                    <td className={`tnum text-right ${m.marginCents >= 0 ? "" : "text-risk"}`}>
                      {formatMoney(m.marginCents, cur)}
                    </td>
                    <td className="tnum text-right">
                      <Badge tone={(m.marginPct ?? 0) >= 60 ? "ok" : (m.marginPct ?? 0) >= 30 ? "warn" : "risk"}>
                        {formatPct(m.marginPct)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Cargar gasto">
            <ExpenseForm clients={clientsList()} today={today} />
          </Card>
        </div>
        <Card title="Caja">
          <CashForm today={today} />
        </Card>
      </div>

      <Card className="mt-4" title="Gastos del periodo" subtitle={`${expenses.length} movimiento(s).`}>
        {expenses.length === 0 ? (
          <EmptyState title="Sin gastos cargados en este periodo" />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoria</th>
                  <th>Proveedor</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="text-muted">{formatDate(e.date)}</td>
                    <td className="font-medium">
                      {e.concept}
                      {e.direct_cost === 1 && <span className="ml-1.5 text-xs text-faint">directo</span>}
                    </td>
                    <td className="text-muted">{EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}</td>
                    <td className="text-muted">{e.vendor || "—"}</td>
                    <td className="text-muted">{e.client_name ?? "—"}</td>
                    <td className="text-muted">
                      {e.cost_type} · {e.recurrence === "recurrente" ? "rec." : "no rec."}
                    </td>
                    <td>
                      <Badge tone={e.status === "pagado" ? "ok" : "warn"}>{e.status}</Badge>
                    </td>
                    <td className="tnum text-right">{formatMoney(e.amount_cents, e.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
