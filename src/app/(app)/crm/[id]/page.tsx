import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { leadById, leadEvents, usersList, userMap } from "@/lib/queries";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL } from "@/lib/types";
import { Badge, Card, PageHeader } from "@/components/ui";
import LeadForm from "../LeadForm";
import { CloseLostForm, CloseWonForm, FollowUpForm, ReopenForm } from "./CloseControls";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const lead = leadById(Number(id));
  if (!lead) notFound();

  const users = usersList();
  const map = userMap();
  const events = leadEvents(lead.id);
  const today = todayISO();
  const overdue = lead.outcome === "open" && lead.next_action_date !== null && lead.next_action_date < today;

  return (
    <>
      <PageHeader title={lead.name} description={[lead.company, lead.specialty].filter(Boolean).join(" · ")}>
        <Link href="/crm" className="btn">
          Volver al CRM
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={lead.outcome === "won" ? "ok" : lead.outcome === "lost" ? "risk" : "brand"}>
          {STAGE_LABEL[lead.stage]}
        </Badge>
        <Badge tone="neutral">Responsable: {map.get(lead.owner_id)?.name ?? "—"}</Badge>
        {lead.setter_id && <Badge tone="neutral">Setter: {map.get(lead.setter_id)?.name}</Badge>}
        {lead.closer_id && <Badge tone="neutral">Closer: {map.get(lead.closer_id)?.name}</Badge>}
        {lead.potential_value_cents > 0 && (
          <Badge tone="brand">{formatMoney(lead.potential_value_cents, lead.potential_currency)} / mes</Badge>
        )}
        {overdue && <Badge tone="risk">Accion vencida ({formatDate(lead.next_action_date)})</Badge>}
        {lead.outcome === "lost" && lead.lost_reason && <Badge tone="risk">Perdida: {lead.lost_reason}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Ficha de la oportunidad">
            <LeadForm lead={lead} users={users} today={today} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Cierre">
            {lead.outcome === "open" ? (
              <div className="space-y-3">
                <CloseWonForm lead={lead} users={users} today={today} />
                <CloseLostForm leadId={lead.id} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Oportunidad {lead.outcome === "won" ? "ganada" : "perdida"} el {formatDate(lead.closed_at)}.
                  {lead.client_id && (
                    <>
                      {" "}
                      <Link href={`/clientes/${lead.client_id}`} className="text-brand hover:underline">
                        Ver ficha del cliente
                      </Link>
                      .
                    </>
                  )}
                </p>
                <ReopenForm leadId={lead.id} today={today} />
              </div>
            )}
          </Card>

          <Card title="Registrar follow-up" subtitle={`${lead.follow_up_count} follow-up(s) registrados.`}>
            <FollowUpForm leadId={lead.id} today={today} />
          </Card>

          <Card title="Linea de tiempo">
            {events.length === 0 ? (
              <p className="text-sm text-muted">Sin movimientos registrados.</p>
            ) : (
              <ol className="space-y-2.5">
                {events.map((e) => (
                  <li key={e.id} className="border-l-2 border-border pl-3">
                    <p className="text-sm">
                      {e.type === "cambio_etapa"
                        ? `${e.from_stage ? `${e.from_stage} → ` : ""}${e.to_stage}`
                        : e.type === "follow_up"
                          ? "Follow-up"
                          : e.type}
                    </p>
                    {e.detail && <p className="text-xs text-muted">{e.detail}</p>}
                    <p className="text-xs text-faint">
                      {formatDateTime(e.at)}
                      {e.user_name ? ` · ${e.user_name}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
