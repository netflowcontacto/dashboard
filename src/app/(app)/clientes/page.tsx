import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { clientsList, userMap } from "@/lib/queries";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { loadFx, toBase } from "@/lib/fx";
import { Badge, Card, EmptyState, PageHeader, Semaforo, StatCard } from "@/components/ui";
import ExportButton from "@/components/ExportButton";
import { PAYMENT_STATUS_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

const ONBOARDING_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  completo: "Completo",
};

/**
 * Clientes. La misma página sirve a dirección y al equipo: las columnas de
 * fee y estado de cobro solo se renderizan si la persona tiene el permiso.
 * No se envian al cliente datos que no puede ver.
 */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const showChurned = sp.bajas === "1";
  const verFees = can(user, "clientes:ver_fees");

  const clients = await clientsList(showChurned);
  const users = await userMap();
  const today = todayISO();
  const fx = await loadFx();
  const base = fx.base;

  const active = clients.filter((c) => !c.churned_at);
  const mrr = active.reduce((a, c) => a + toBase(c.fee_cents, c.fee_currency, fx), 0);
  const counts = {
    bien: active.filter((c) => c.account_health === "bien").length,
    atencion: active.filter((c) => c.account_health === "atencion").length,
    riesgo: active.filter((c) => c.account_health === "riesgo").length,
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Estado de cada cuenta activa: plan, responsables, onboarding y semaforo."
      >
        <ExportButton kind="clientes" />
        <Link href={showChurned ? "/clientes" : "/clientes?bajas=1"} className="btn">
          {showChurned ? "Ocultar bajas" : "Ver bajas"}
        </Link>
        {verFees && (
          <Link href="/clientes/nuevo" className="btn btn-primary">
            Nuevo cliente
          </Link>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes activos" value={active.length} />
        <StatCard label="Bien" value={counts.bien} tone="ok" />
        <StatCard label="En atención" value={counts.atencion} tone={counts.atencion ? "warn" : "neutral"} />
        {verFees ? (
          <StatCard label="MRR" value={formatMoney(mrr, base)} />
        ) : (
          <StatCard label="En riesgo" value={counts.riesgo} tone={counts.riesgo ? "risk" : "ok"} />
        )}
      </div>

      <Card className="mt-4" title="Cartera">
        {clients.length === 0 ? (
          <EmptyState
            title="Todavia no hay clientes cargados"
            detail="Se crean solos al cerrar una oportunidad como ganada en el CRM."
          />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Plan</th>
                  {verFees && <th className="text-right">Fee mensual</th>}
                  <th>Alta</th>
                  {verFees && <th>Próximo cobro</th>}
                  {verFees && <th>Pago</th>}
                  <th>Paid Media</th>
                  <th>Setter</th>
                  <th>Desarrollo</th>
                  <th>Onboarding</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const overdueCharge =
                    verFees && c.next_charge_date !== null && c.next_charge_date < today && !c.churned_at;
                  return (
                    <tr key={c.id} className={c.churned_at ? "opacity-60" : undefined}>
                      <td>
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        {c.churned_at && (
                          <span className="ml-2 text-xs text-risk">baja {formatDate(c.churned_at)}</span>
                        )}
                        {c.specialty && <p className="text-xs text-faint">{c.specialty}</p>}
                      </td>
                      <td className="text-muted">{c.plan || "—"}</td>
                      {verFees && (
                        <td className="tnum text-right">{formatMoney(c.fee_cents, c.fee_currency)}</td>
                      )}
                      <td className="text-muted">{formatDate(c.start_date)}</td>
                      {verFees && (
                        <td className={overdueCharge ? "text-risk" : "text-muted"}>
                          {formatDate(c.next_charge_date)}
                        </td>
                      )}
                      {verFees && (
                        <td>
                          <Badge
                            tone={
                              c.payment_status === "al_dia"
                                ? "ok"
                                : c.payment_status === "pendiente"
                                  ? "warn"
                                  : "risk"
                            }
                          >
                            {PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status}
                          </Badge>
                        </td>
                      )}
                      <td className="text-muted">
                        {c.paid_media_owner_id ? users.get(c.paid_media_owner_id)?.name : "—"}
                      </td>
                      <td className="text-muted">
                        {c.setter_owner_id ? users.get(c.setter_owner_id)?.name : "—"}
                      </td>
                      <td className="text-muted">
                        {c.dev_required ? (c.landing ? "Si · landing" : "Si") : c.landing ? "Landing" : "—"}
                      </td>
                      <td>
                        <Badge tone={c.onboarding_status === "completo" ? "ok" : "warn"}>
                          {ONBOARDING_LABEL[c.onboarding_status]}
                        </Badge>
                      </td>
                      <td>
                        <Semaforo health={c.account_health} />
                        {c.alerts_note && <p className="mt-0.5 text-xs text-muted">{c.alerts_note}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
