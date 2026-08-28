import { requireAdminOr404 } from "@/lib/auth";
import { all } from "@/lib/db";
import { resolveRange, formatDate, todayISO, plural } from "@/lib/dates";
import { financeSummary, expensesByCategory, marginByClient, monthlyTrend } from "@/lib/metrics/finance";
import { formatMoney } from "@/lib/money";
import { loadFx } from "@/lib/fx";
import { clientsList } from "@/lib/queries";
import { EXPENSE_CATEGORY_LABEL, type Currency, type ExpenseCategory } from "@/lib/types";
import { previousRange, MONTH_SHORT } from "@/lib/metrics/compare";
import { Badge, Card, EmptyState, Note, PageHeader, SectionTitle, StatCard, formatPct } from "@/components/ui";
import { BarList, ColumnsChart, type DeltaValue } from "@/components/charts";
import RangePicker from "@/components/RangePicker";
import ExportButton from "@/components/ExportButton";
import ExpenseForm, { CashForm } from "./ExpenseForm";
import { COST_TYPE_LABEL, EXPENSE_STATUS_LABEL } from "@/lib/types";

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
  await requireAdminOr404();
  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const f = await financeSummary(range);
  const byCategory = await expensesByCategory(range);
  const margins = await marginByClient(range);
  const trend = await monthlyTrend(6, range.to);
  const cur = f.currency;
  const today = todayISO();
  const prev = previousRange(range);
  const prevFinance = await financeSummary(prev);
  const moneyDelta = (current: number, previous: number, higherIsBetter = true): DeltaValue => ({
    pct: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100,
    higherIsBetter,
    vs: prev.label,
  });

  const expenses = await all<{
    id: number; concept: string; category: ExpenseCategory; amount_cents: number; currency: Currency;
    date: string; cost_type: string; recurrence: string; vendor: string; status: string;
    client_name: string | null; direct_cost: number;
  }>(
    `SELECT e.*, c.name AS client_name FROM expenses e
     LEFT JOIN clients c ON c.id = e.client_id
     WHERE e.date BETWEEN ? AND ? ORDER BY e.date DESC, e.id DESC LIMIT 100`,
    [range.from, range.to],
  );

    return (
    <>
      <PageHeader
        title="Finanzas"
        description={`Información sensible: visible únicamente para dirección. Consolidado en ${cur} al tipo de cambio de referencia (1 USD = ${(await loadFx()).rate} ARS).`}
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Facturado"
          value={formatMoney(f.billedCents, cur)}
          delta={moneyDelta(f.billedCents, prevFinance.billedCents)}
        />
        <StatCard
          label="Cobrado"
          value={formatMoney(f.collectedCents, cur)}
          tone="ok"
          delta={moneyDelta(f.collectedCents, prevFinance.collectedCents)}
        />
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
          delta={moneyDelta(f.resultCents, prevFinance.resultCents)}
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
        <StatCard label="MRR" value={formatMoney(f.mrrCents, cur)} hint={plural(f.activeClients, "cliente")} />
        <StatCard label="MRR nuevo" value={formatMoney(f.newMrrCents, cur)} tone="ok" />
        <StatCard
          label="Costo operativo por cliente"
          value={f.operatingCostPerClientCents !== null ? formatMoney(f.operatingCostPerClientCents, cur) : "—"}
        />
        <StatCard
          label="Gastos impagos del período"
          value={formatMoney(f.unpaidExpensesCents, cur)}
          tone={f.unpaidExpensesCents > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Gastos por categoría" subtitle="Dónde se va la plata en este período.">
          {byCategory.length === 0 ? (
            <EmptyState title="Sin gastos cargados en el período" />
          ) : (
            <BarList
              rows={byCategory.map((c) => ({
                key: c.category,
                label: EXPENSE_CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category,
                value: c.totalCents,
                hint: `${c.pctOfTotal.toFixed(0)}%`,
              }))}
              format={{ kind: "moneda", currency: cur }}
            />
          )}
        </Card>

        <Card title="Tendencia 6 meses" subtitle="Facturado vs gastos, consolidado.">
          <ColumnsChart
            labels={trend.map((t) => MONTH_SHORT[Number(t.period.slice(5, 7)) - 1])}
            series={[
              { key: "facturado", label: "Facturado", slot: 1, values: trend.map((t) => t.billedCents) },
              { key: "gastos", label: "Gastos", slot: 2, values: trend.map((t) => t.expensesCents) },
            ]}
            format={{ kind: "moneda", currency: cur }}
            height={180}
          />
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
            <ExpenseForm clients={await clientsList()} today={today} />
          </Card>
        </div>
        <Card title="Caja">
          <CashForm today={today} />
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Gastos del período"
        subtitle={`${plural(expenses.length, "movimiento")}.`}
        action={<ExportButton kind="gastos" from={range.from} to={range.to} />}
      >
        {expenses.length === 0 ? (
          <EmptyState title="Sin gastos cargados en este período" />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
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
                      {COST_TYPE_LABEL[e.cost_type] ?? e.cost_type} · {e.recurrence === "recurrente" ? "rec." : "no rec."}
                    </td>
                    <td>
                      <Badge tone={e.status === "pagado" ? "ok" : "warn"}>{EXPENSE_STATUS_LABEL[e.status] ?? e.status}</Badge>
                    </td>
                    <td className="tnum text-right">{formatMoney(e.amount_cents, e.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note>
        Todo importe se guarda en su moneda original. El tipo de cambio de referencia solo afecta
        cómo se suman los totales: cambiarlo en Ajustes no modifica ningún dato cargado. Las
        comparaciones son contra {prev.label}.
      </Note>
    </>
  );
}
