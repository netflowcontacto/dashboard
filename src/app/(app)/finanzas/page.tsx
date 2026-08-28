import { requireAdminOr404 } from "@/lib/auth";
import { all } from "@/lib/db";
import { resolveRange, formatDate, todayISO, plural } from "@/lib/dates";
import { financeSummary, expensesByCategory, marginByClient, monthlyTrend } from "@/lib/metrics/finance";
import { formatMoney } from "@/lib/money";
import { loadFx } from "@/lib/fx";
import { clientsList } from "@/lib/queries";
import { EXPENSE_CATEGORY_LABEL, type Currency, type ExpenseCategory } from "@/lib/types";
import { previousRange, MONTH_SHORT } from "@/lib/metrics/compare";
import { METRICS, evaluate, metricContext } from "@/lib/metrics/registry";
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

  // Unit economics. Se piden por clave al registro para que la definición, la
  // unidad y el "más es mejor" vengan del mismo lugar que las usa el resto del
  // sistema, y para que agregar una métrica acá no requiera tocar la pantalla.
  const CLAVES_UNIT = [
    "cac_pauta",
    "cac_total",
    "ltv",
    "ltv_cac",
    "payback_meses",
    "roas_pauta",
    "roi_pauta",
    "vida_media_meses",
  ];
  const ctx = await metricContext(range);
  const unit = await Promise.all(
    CLAVES_UNIT.map((k) => METRICS.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => m !== undefined)
      .map((m) => evaluate(m, ctx)),
  );
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

      <SectionTitle>Unit economics</SectionTitle>
      <p className="-mt-1 mb-2.5 max-w-2xl text-xs leading-relaxed text-muted">
        Cuánto cuesta traer un cliente y cuánto deja. El CAC va en dos versiones a propósito: el
        de pauta deja afuera referidos y outbound, que no costaron un peso de publicidad, y es el
        que sirve para decidir cuánto invertir.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {unit.map((m) => (
          <StatCard
            key={m.key}
            label={m.label}
            value={formatoMetrica(m, cur)}
            hint={m.value === null ? motivoVacio(m.key) : m.help}
            tone={tonoDe(m)}
          />
        ))}
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

/**
 * Cómo se escribe cada métrica según su unidad.
 *
 * LTV/CAC y el recupero son números sueltos y no llevan símbolo; el ROI es
 * porcentaje; el resto es plata. Sale de la unidad declarada en el registro y
 * no de una lista escrita a mano acá.
 */
function formatoMetrica(
  m: { unit: string; value: number | null; key: string },
  moneda: Currency,
): string {
  if (m.value === null) return "—";
  if (m.unit === "moneda") return formatMoney(Math.round(m.value * 100), moneda);
  if (m.unit === "porcentaje") return formatPct(m.value, 0);
  if (m.key === "ltv_cac") return `${m.value.toFixed(1)}×`;
  if (m.key === "payback_meses" || m.key === "vida_media_meses") {
    return `${m.value.toFixed(1)} ${m.value === 1 ? "mes" : "meses"}`;
  }
  return m.value.toFixed(1);
}

/**
 * Solo se pinta lo que tiene un umbral con significado del negocio.
 * LTV/CAC por debajo de 1 es perder plata con cada cliente nuevo; 3 es la
 * referencia de un modelo sano. El resto queda neutro: colorear un número sin
 * un umbral atrás es decorar.
 */
function tonoDe(m: { key: string; value: number | null }): "ok" | "warn" | "risk" | "neutral" {
  if (m.value === null) return "neutral";
  if (m.key === "ltv_cac") return m.value >= 3 ? "ok" : m.value >= 1 ? "warn" : "risk";
  if (m.key === "roi_pauta") return m.value > 0 ? "ok" : "risk";
  return "neutral";
}

/**
 * Por qué una métrica no tiene número todavía.
 *
 * Un "—" solo parece un error del sistema. Estas cifras se apagan por razones
 * concretas del negocio —no hubo cierres de pauta, todavía no se dio de baja
 * nadie— y decirlo convierte un hueco en información: la mitad de las veces
 * el mensaje es la respuesta que la persona vino a buscar.
 */
function motivoVacio(key: string): string {
  switch (key) {
    case "cac_pauta":
      return "Ningún cliente del período vino de un lead de pauta. Los referidos y el outbound no cuentan acá.";
    case "cac_total":
      return "No se cerró ningún cliente en el período.";
    case "vida_media_meses":
      return "Todavía no se dio de baja ningún cliente, así que no hay con qué calcular la duración promedio.";
    case "ltv":
      return "Necesita la vida media del cliente y el margen bruto del período.";
    case "ltv_cac":
      return "Necesita el LTV y el CAC de pauta.";
    case "payback_meses":
      return "Necesita el CAC de pauta y el margen bruto.";
    case "roas_pauta":
    case "roi_pauta":
      return "Las oportunidades de pauta del período todavía no se resolvieron, o no hay inversión cargada. Cuando alguna cierre o se pierda aparece el número.";
    default:
      return "Sin datos suficientes en el período.";
  }
}
