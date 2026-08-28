import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { resolveRange, formatDate, todayISO } from "@/lib/dates";
import { areaMetrics } from "@/lib/metrics/team";
import { formatMoney } from "@/lib/money";
import { baseCurrency } from "@/lib/fx";
import { clientsList } from "@/lib/queries";
import type { Currency } from "@/lib/types";
import { Card, EmptyState, PageHeader, StatCard, formatMetric } from "@/components/ui";
import RangePicker from "@/components/RangePicker";
import ExpenseForm from "../finanzas/ExpenseForm";
import CampaignAssetForm from "./CampaignAssetForm";

export const dynamic = "force-dynamic";

/**
 * Inversión publicitaria — vista de Paid Media.
 *
 * Deja cargar inversión y creativos, y ver el rendimiento de la pauta,
 * SIN abrir ninguna otra categoría de gasto ni información financiera de la
 * empresa. Es el permiso 'paid_media:cargar', no 'finanzas:*'.
 */
export default async function InversionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "paid_media:cargar")) {
    return (
      <>
        <PageHeader title="Inversión publicitaria" />
        <EmptyState title="Esta vista es del area de Paid Media" />
      </>
    );
  }

  const sp = await searchParams;
  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });

  const metrics = areaMetrics("paid_media", range, null);
  const cur = baseCurrency();

  const spend = getDb()
    .prepare(
      `SELECT id, concept, amount_cents, currency, date, platform, campaign, vendor
       FROM expenses WHERE category = 'paid_media' AND date BETWEEN ? AND ?
       ORDER BY date DESC, id DESC LIMIT 60`,
    )
    .all(range.from, range.to) as {
      id: number; concept: string; amount_cents: number; currency: Currency;
      date: string; platform: string; campaign: string; vendor: string;
    }[];

  const assets = getDb()
    .prepare(
      `SELECT id, name, kind, platform, campaign, date, result FROM campaign_assets
       WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 40`,
    )
    .all(range.from, range.to) as {
      id: number; name: string; kind: string; platform: string; campaign: string;
      date: string; result: string;
    }[];

  return (
    <>
      <PageHeader
        title="Inversión publicitaria"
        description="Carga de pauta y creativos. Es la misma fuente que alimenta el CPL y el CAC del funnel."
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {metrics.map((m) => (
          <StatCard key={m.key} label={m.label} value={formatMetric(m.value, m.unit, cur)} hint={m.help} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Cargar inversión">
          <ExpenseForm clients={clientsList()} today={todayISO()} onlyPaidMedia />
        </Card>
        <Card title="Registrar creativo o test">
          <CampaignAssetForm today={todayISO()} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Inversión del período">
          {spend.length === 0 ? (
            <EmptyState title="Sin inversión cargada en el período" />
          ) : (
            <div className="scroll-x">
              <table className="nf">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Plataforma</th>
                    <th>Campaña</th>
                    <th className="text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {spend.map((s) => (
                    <tr key={s.id}>
                      <td className="text-muted">{formatDate(s.date)}</td>
                      <td className="font-medium">{s.concept}</td>
                      <td className="text-muted">{s.platform || "—"}</td>
                      <td className="text-muted">{s.campaign || "—"}</td>
                      <td className="tnum text-right">{formatMoney(s.amount_cents, s.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Creativos y tests">
          {assets.length === 0 ? (
            <EmptyState title="Sin creativos registrados en el período" />
          ) : (
            <div className="scroll-x">
              <table className="nf">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Campaña</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td className="text-muted">{formatDate(a.date)}</td>
                      <td className="font-medium">{a.name}</td>
                      <td className="text-muted">{a.kind === "test" ? "Test" : "Creativo"}</td>
                      <td className="text-muted">{a.campaign || "—"}</td>
                      <td className="text-muted">{a.result || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
