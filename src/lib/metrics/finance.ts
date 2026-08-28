import "server-only";
import { all } from "../db";
import { loadFx, toBase, type Fx } from "../fx";
import { addDays, monthOf, type DateRange } from "../dates";
import type { Currency } from "../types";

/**
 * Motor financiero.
 *
 * Regla de consolidación: cada fila se guarda en su moneda original y se
 * convierte a la moneda base al sumar, con el tipo de cambio de referencia.
 */

interface MoneyRow {
  cents: number;
  currency: Currency;
}

function consolidate(rows: MoneyRow[], fx: Fx): number {
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, fx), 0);
}

export interface FinanceSummary {
  currency: Currency;
  billedCents: number;
  collectedCents: number;
  pendingCents: number;
  mrrCents: number;
  newMrrCents: number;

  directCostsCents: number;
  operatingExpensesCents: number;
  totalExpensesCents: number;
  fixedCostsCents: number;
  variableCostsCents: number;
  unpaidExpensesCents: number;

  /** ingresos - costos directos - gastos operativos */
  resultCents: number;
  grossMarginCents: number;
  grossMarginPct: number | null;
  netMarginPct: number | null;

  activeClients: number;
  operatingCostPerClientCents: number | null;
  averageTicketCents: number | null;

  cashCents: number;
  burnPerMonthCents: number;
  runwayMonths: number | null;
}

export async function financeSummary(range: DateRange): Promise<FinanceSummary> {
  const { from, to } = range;
  const fx = await loadFx();

  const [billed, collected, pending, expenses, activeClientRows, newClientRows, cashCents, burnPerMonthCents] =
    await Promise.all([
      all<MoneyRow>(
        `SELECT amount_cents AS cents, currency FROM invoices WHERE issued_at BETWEEN ? AND ?`,
        [from, to],
      ),
      all<MoneyRow>(
        `SELECT amount_cents AS cents, currency FROM invoices
         WHERE status = 'cobrada' AND substr(paid_at,1,10) BETWEEN ? AND ?`,
        [from, to],
      ),
      all<MoneyRow>(
        `SELECT amount_cents AS cents, currency FROM invoices
         WHERE status = 'pendiente' AND issued_at <= ?`,
        [to],
      ),
      all<MoneyRow & { cost_type: string; direct_cost: number; status: string }>(
        `SELECT amount_cents AS cents, currency, cost_type, direct_cost, status
         FROM expenses WHERE date BETWEEN ? AND ?`,
        [from, to],
      ),
      all<MoneyRow>(
        `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
         WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        [to, to],
      ),
      all<MoneyRow>(
        `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
         WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL`,
        [from, to],
      ),
      cashAvailableCents(to, fx),
      averageMonthlyBurnCents(to, fx),
    ]);

  const directCostsCents = consolidate(expenses.filter((e) => e.direct_cost === 1), fx);
  const operatingExpensesCents = consolidate(expenses.filter((e) => e.direct_cost === 0), fx);
  const mrrCents = consolidate(activeClientRows, fx);
  const activeClients = activeClientRows.length;

  const billedCents = consolidate(billed, fx);
  const resultCents = billedCents - directCostsCents - operatingExpensesCents;
  const grossMarginCents = billedCents - directCostsCents;

  return {
    currency: fx.base,
    billedCents,
    collectedCents: consolidate(collected, fx),
    pendingCents: consolidate(pending, fx),
    mrrCents,
    newMrrCents: consolidate(newClientRows, fx),
    directCostsCents,
    operatingExpensesCents,
    totalExpensesCents: directCostsCents + operatingExpensesCents,
    fixedCostsCents: consolidate(expenses.filter((e) => e.cost_type === "fijo"), fx),
    variableCostsCents: consolidate(expenses.filter((e) => e.cost_type === "variable"), fx),
    unpaidExpensesCents: consolidate(expenses.filter((e) => e.status === "pendiente"), fx),
    resultCents,
    grossMarginCents,
    grossMarginPct: billedCents > 0 ? (grossMarginCents / billedCents) * 100 : null,
    netMarginPct: billedCents > 0 ? (resultCents / billedCents) * 100 : null,
    activeClients,
    operatingCostPerClientCents: activeClients > 0 ? Math.round(operatingExpensesCents / activeClients) : null,
    averageTicketCents: activeClients > 0 ? Math.round(mrrCents / activeClients) : null,
    cashCents,
    burnPerMonthCents,
    runwayMonths: burnPerMonthCents > 0 ? cashCents / burnPerMonthCents : null,
  };
}

/** Caja disponible = último saldo declarado de cada cuenta, consolidado. */
export async function cashAvailableCents(asOf: string, fx?: Fx): Promise<number> {
  const context = fx ?? (await loadFx());
  const rows = await all<MoneyRow>(
    `SELECT DISTINCT ON (account) balance_cents AS cents, currency
     FROM cash_snapshots
     WHERE date <= ?
     ORDER BY account, date DESC, id DESC`,
    [asOf],
  );
  return consolidate(rows, context);
}

/** Burn promedio de los últimos 3 meses. */
export async function averageMonthlyBurnCents(asOf: string, fx?: Fx): Promise<number> {
  const context = fx ?? (await loadFx());
  const rows = await all<MoneyRow>(
    `SELECT amount_cents AS cents, currency FROM expenses WHERE date BETWEEN ? AND ?`,
    [addDays(asOf, -89), asOf],
  );
  if (rows.length === 0) return 0;
  return Math.round(consolidate(rows, context) / 3);
}

export async function runwayMonths(asOf: string): Promise<number | null> {
  const fx = await loadFx();
  const burn = await averageMonthlyBurnCents(asOf, fx);
  if (burn <= 0) return null;
  return (await cashAvailableCents(asOf, fx)) / burn;
}

export interface ExpenseBreakdownRow {
  category: string;
  totalCents: number;
  count: number;
  pctOfTotal: number;
}

export async function expensesByCategory(range: DateRange): Promise<ExpenseBreakdownRow[]> {
  const fx = await loadFx();
  const rows = await all<MoneyRow & { category: string }>(
    `SELECT category, amount_cents AS cents, currency FROM expenses WHERE date BETWEEN ? AND ?`,
    [range.from, range.to],
  );

  const byCategory = new Map<string, { totalCents: number; count: number }>();
  for (const r of rows) {
    const entry = byCategory.get(r.category) ?? { totalCents: 0, count: 0 };
    entry.totalCents += toBase(r.cents, r.currency, fx);
    entry.count += 1;
    byCategory.set(r.category, entry);
  }
  const total = [...byCategory.values()].reduce((a, b) => a + b.totalCents, 0);
  return [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      totalCents: v.totalCents,
      count: v.count,
      pctOfTotal: total > 0 ? (v.totalCents / total) * 100 : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export interface ClientMarginRow {
  clientId: number;
  name: string;
  feeCents: number;
  directCostCents: number;
  marginCents: number;
  marginPct: number | null;
}

/** Margen por cliente: fee mensual menos los costos directos imputados a esa cuenta. */
export async function marginByClient(range: DateRange): Promise<ClientMarginRow[]> {
  const fx = await loadFx();

  const [clients, costs] = await Promise.all([
    all<{ id: number; name: string; fee_cents: number; fee_currency: Currency }>(
      `SELECT id, name, fee_cents, fee_currency FROM clients
       WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?) ORDER BY name`,
      [range.to, range.to],
    ),
    all<MoneyRow & { client_id: number }>(
      `SELECT client_id, amount_cents AS cents, currency FROM expenses
       WHERE client_id IS NOT NULL AND date BETWEEN ? AND ?`,
      [range.from, range.to],
    ),
  ]);

  const costByClient = new Map<number, number>();
  for (const c of costs) {
    costByClient.set(c.client_id, (costByClient.get(c.client_id) ?? 0) + toBase(c.cents, c.currency, fx));
  }

  return clients.map((c) => {
    const feeCents = toBase(c.fee_cents, c.fee_currency, fx);
    const directCostCents = costByClient.get(c.id) ?? 0;
    const marginCents = feeCents - directCostCents;
    return {
      clientId: c.id,
      name: c.name,
      feeCents,
      directCostCents,
      marginCents,
      marginPct: feeCents > 0 ? (marginCents / feeCents) * 100 : null,
    };
  });
}

/** Serie mensual de ingresos vs gastos, para ver tendencia. */
export async function monthlyTrend(
  months: number,
  asOf: string,
): Promise<{ period: string; billedCents: number; expensesCents: number; resultCents: number }[]> {
  const fx = await loadFx();
  const [year, month] = monthOf(asOf).split("-").map(Number);

  const periods = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (months - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });

  // Una sola consulta por concepto en vez de dos por mes: con una base remota,
  // doce viajes de red por gráfico se notan.
  const [billedRows, spentRows] = await Promise.all([
    all<{ period: string; cents: number; currency: Currency }>(
      `SELECT substr(issued_at,1,7) AS period, amount_cents AS cents, currency
       FROM invoices WHERE substr(issued_at,1,7) = ANY(?)`,
      [periods],
    ),
    all<{ period: string; cents: number; currency: Currency }>(
      `SELECT substr(date,1,7) AS period, amount_cents AS cents, currency
       FROM expenses WHERE substr(date,1,7) = ANY(?)`,
      [periods],
    ),
  ]);

  const sumBy = (rows: { period: string; cents: number; currency: Currency }[]) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.period, (map.get(r.period) ?? 0) + toBase(r.cents, r.currency, fx));
    }
    return map;
  };

  const billed = sumBy(billedRows);
  const spent = sumBy(spentRows);

  return periods.map((period) => {
    const billedCents = billed.get(period) ?? 0;
    const expensesCents = spent.get(period) ?? 0;
    return { period, billedCents, expensesCents, resultCents: billedCents - expensesCents };
  });
}
