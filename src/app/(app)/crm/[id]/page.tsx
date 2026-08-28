import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { leadById, leadEvents, usersList, userMap } from "@/lib/queries";
import { formatDate, formatDateTime, todayISO, plural } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL } from "@/lib/types";
import { Badge, Card, PageHeader } from "@/components/ui";
import {
  IconCalendario, IconEmail, IconFlecha, IconNota, IconTelefono, IconWhatsapp,
} from "@/components/icons";
import LeadForm from "../LeadForm";
import { CloseLostForm, CloseWonForm, ReopenForm } from "./CloseControls";
import ActivityComposer from "./ActivityComposer";
import ContactActions from "@/components/ContactActions";
import Attachments from "@/components/Attachments";
import { listAttachments } from "@/actions/attachments";
import { can } from "@/lib/permissions";
import { LEAD_EVENT_LABEL, humanize, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Un icono por tipo de evento: la bitácora se escanea con la vista. */
function EventIcon({ type }: { type: string }) {
  if (type === "llamada") return <IconTelefono size={15} />;
  if (type === "whatsapp") return <IconWhatsapp size={15} />;
  if (type === "email") return <IconEmail size={15} />;
  if (type === "reunion") return <IconCalendario size={15} />;
  if (type === "cambio_etapa") return <IconFlecha size={15} />;
  return <IconNota size={15} />;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const lead = await leadById(Number(id));
  if (!lead) notFound();

  const users = await usersList();
  const map = await userMap();
  const events = await leadEvents(lead.id);
  const today = todayISO();
  const attachments = await listAttachments("lead", lead.id);
  const puedeAdjuntar = can(user, "archivos:subir");
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
        {overdue && <Badge tone="risk">Acción vencida ({formatDate(lead.next_action_date)})</Badge>}
        {lead.outcome === "lost" && lead.lost_reason && <Badge tone="risk">Perdida: {lead.lost_reason}</Badge>}
      </div>

      <Card className="mb-4" title="Contactar" padding>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ContactActions
            leadId={lead.id}
            nombre={lead.name}
            empresa={lead.company}
            telefono={lead.contact_phone}
            email={lead.contact_email}
          />
          <p className="text-xs text-faint">
            Al abrir cualquiera de estos, el intento queda registrado abajo y se marca el primer
            contacto.
          </p>
        </div>
      </Card>

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

          <Card title="Archivos" subtitle="Propuestas, contratos, capturas — todo lo de esta oportunidad.">
            <Attachments kind="lead" ownerId={lead.id} items={attachments} canEdit={puedeAdjuntar} />
          </Card>

          <Card
            title="Registrar actividad"
            subtitle="Lo que pasó y qué sigue, en un solo paso."
          >
            <ActivityComposer leadId={lead.id} today={today} />
          </Card>

          <Card
            title="Bitácora"
            subtitle={`${plural(events.length, "movimiento")} · toda la historia de la oportunidad.`}
          >
            {events.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay actividad registrada.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className={`mt-0.5 shrink-0 ${
                        e.type === "cambio_etapa" ? "text-brand-ink" : "text-faint"
                      }`}
                    >
                      <EventIcon type={e.type} />
                    </span>
                    <span className="min-w-0 flex-1 border-b border-border pb-2.5 last:border-0">
                      <span className="block text-sm">
                        {e.type === "cambio_etapa"
                          ? `${e.from_stage ? `${STAGE_LABEL[e.from_stage as Stage] ?? e.from_stage} → ` : ""}${
                              STAGE_LABEL[e.to_stage as Stage] ?? e.to_stage
                            }`
                          : (LEAD_EVENT_LABEL[e.type] ?? humanize(e.type))}
                      </span>
                      {e.detail && (
                        <span className="mt-0.5 block whitespace-pre-wrap text-xs text-muted">
                          {e.detail}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-faint">
                        {formatDateTime(e.at)}
                        {e.user_name ? ` · ${e.user_name}` : ""}
                      </span>
                    </span>
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
