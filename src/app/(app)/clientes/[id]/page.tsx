import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { clientById, usersList, userMap } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader, Semaforo } from "@/components/ui";
import ClientForm, { AccountHealthForm } from "../ClientForm";
import { PAYMENT_STATUS_LABEL, INVOICE_STATUS_LABEL, TASK_CATEGORY_LABEL, TASK_STATUS_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = clientById(Number(id));
  if (!client) notFound();

  const verFees = can(user, "clientes:ver_fees");
  const users = usersList();
  const map = userMap();

  const invoices = verFees
    ? (getDb()
        .prepare("SELECT * FROM invoices WHERE client_id = ? ORDER BY issued_at DESC LIMIT 12")
        .all(client.id) as {
        id: number; period: string; concept: string; amount_cents: number;
        currency: "ARS" | "USD"; issued_at: string; status: string; paid_at: string | null;
      }[])
    : [];

  const tasks = getDb()
    .prepare(
      `SELECT id, title, status, due_date, category FROM tasks
       WHERE client_id = ? ORDER BY status = 'hecho', COALESCE(due_date,'9999-12-31') LIMIT 10`,
    )
    .all(client.id) as { id: number; title: string; status: string; due_date: string | null; category: string }[];

  return (
    <>
      <PageHeader title={client.name} description={[client.specialty, client.plan].filter(Boolean).join(" · ")}>
        <Link href="/clientes" className="btn">
          Volver
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Semaforo health={client.account_health} />
        <Badge tone="neutral">Alta {formatDate(client.start_date)}</Badge>
        {verFees && <Badge tone="brand">{formatMoney(client.fee_cents, client.fee_currency)} / mes</Badge>}
        {verFees && (
          <Badge tone={client.payment_status === "al_dia" ? "ok" : client.payment_status === "pendiente" ? "warn" : "risk"}>
            Pago: {PAYMENT_STATUS_LABEL[client.payment_status] ?? client.payment_status}
          </Badge>
        )}
        {client.churned_at && <Badge tone="risk">Baja {formatDate(client.churned_at)}</Badge>}
        {client.paid_media_owner_id && (
          <Badge tone="neutral">Paid Media: {map.get(client.paid_media_owner_id)?.name}</Badge>
        )}
        {client.setter_owner_id && <Badge tone="neutral">Setter: {map.get(client.setter_owner_id)?.name}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={verFees ? "Ficha del cliente" : "Estado de la cuenta"}>
            {verFees ? (
              <ClientForm client={client} users={users} today={todayISO()} />
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  Podes actualizar el estado operativo de la cuenta. La información comercial y de cobro la
                  gestiona dirección.
                </p>
                <AccountHealthForm client={client} />
              </>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {verFees && (
            <Card title="Últimas facturas">
              {invoices.length === 0 ? (
                <EmptyState title="Sin facturas cargadas" />
              ) : (
                <table className="nf">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th className="text-right">Importe</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i.id}>
                        <td>{i.period}</td>
                        <td className="tnum text-right">{formatMoney(i.amount_cents, i.currency)}</td>
                        <td>
                          <Badge tone={i.status === "cobrada" ? "ok" : i.status === "pendiente" ? "warn" : "risk"}>
                            {INVOICE_STATUS_LABEL[i.status] ?? i.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          <Card title="Trabajo asociado">
            {tasks.length === 0 ? (
              <EmptyState title="Sin tareas ni proyectos" />
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">{t.title}</p>
                      <p className="text-xs text-faint">
                        {TASK_CATEGORY_LABEL[t.category] ?? t.category}
                        {t.due_date ? ` · vence ${formatDate(t.due_date)}` : ""}
                      </p>
                    </div>
                    <Badge tone={t.status === "hecho" ? "ok" : t.status === "bloqueado" ? "risk" : "neutral"}>
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {client.notes && (
            <Card title="Notas">
              <p className="whitespace-pre-wrap text-sm text-muted">{client.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
