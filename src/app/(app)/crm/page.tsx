import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { leadsList, leadSources, userMap, usersList } from "@/lib/queries";
import { formatDate, todayISO, dueLabel, plural } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { loadFx, toBase } from "@/lib/fx";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/types";
import { Badge, Card, EmptyState, Note, PageHeader, StatCard } from "@/components/ui";
import ExportButton from "@/components/ExportButton";
import ContactActions from "@/components/ContactActions";
import PipelineFilters from "./PipelineFilters";
import PipelineBoard from "./PipelineBoard";
import ViewToggle from "./ViewToggle";
import { SOURCE_LABEL, humanize } from "@/lib/types";

export const dynamic = "force-dynamic";

const OPEN_STAGES: Stage[] = [
  "nuevo", "contactado", "calificado", "reunion_agendada",
  "reunion_realizada", "propuesta", "follow_up",
];

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;

  const filters = {
    stage: (sp.stage as string) || "todas",
    ownerId: sp.owner ? Number(sp.owner) : undefined,
    outcome: (sp.outcome as string) || "open",
    source: (sp.source as string) || "todas",
    q: (sp.q as string) || undefined,
  };
  const vista = sp.vista === "lista" ? "lista" : "tablero";

  const leads = await leadsList(filters);
  const users = await userMap();
  const today = todayISO();

  const byStage = new Map<Stage, typeof leads>();
  for (const s of OPEN_STAGES) byStage.set(s, []);
  for (const l of leads) {
    if (byStage.has(l.stage)) byStage.get(l.stage)!.push(l);
  }

  const openLeads = leads.filter((l) => l.outcome === "open");
  const openCount = openLeads.length;
  const overdueCount = openLeads.filter(
    (l) => l.next_action_date !== null && l.next_action_date < today,
  ).length;
  // Sumar centavos de monedas distintas da un número que no significa nada.
  // Cada valor se lleva a la moneda base antes de sumar; el original queda
  // intacto y cada tarjeta lo sigue mostrando en la moneda en que se cargó.
  const fx = await loadFx();
  const openValue = openLeads.reduce(
    (a, l) => a + toBase(l.potential_value_cents, l.potential_currency, fx),
    0,
  );
  const missingData = openLeads.filter(
    (l) => !l.next_action || !l.next_action_date || !l.owner_id,
  ).length;

  return (
    <>
      <PageHeader
        title="CRM"
        description="Pipeline comercial de NetFlow. Ninguna oportunidad abierta puede quedar sin responsable, estado y próxima acción."
      >
        <ExportButton kind="crm" />
        <Link href="/crm/nueva" className="btn btn-primary">
          Nueva oportunidad
        </Link>
      </PageHeader>

      <PipelineFilters
        users={await usersList()}
        sources={await leadSources()}
        current={{
          stage: filters.stage,
          owner: filters.ownerId ? String(filters.ownerId) : "",
          outcome: filters.outcome,
          source: filters.source,
          q: filters.q ?? "",
        }}
      />

      {missingData > 0 && (
        <p className="mb-4 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-sm text-warn">
          {missingData} oportunidad(es) abiertas sin próxima acción definida. Son las primeras que hay que ordenar.
        </p>
      )}

      <div className="mt-6 mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Oportunidades abiertas" value={openCount} />
        <StatCard
          label="Con acción vencida"
          value={overdueCount}
          tone={overdueCount > 0 ? "risk" : "ok"}
        />
        <StatCard
          label="Sin próxima acción"
          value={missingData}
          tone={missingData > 0 ? "warn" : "ok"}
        />
        <StatCard label="Valor potencial abierto" value={formatMoney(openValue, fx.base)} />
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <ViewToggle vista={vista} query={sp} />
        <p className="text-xs text-faint">
          {vista === "tablero"
            ? `${plural(openLeads.length, "oportunidad", "oportunidades")} abiertas`
            : `${plural(leads.length, "resultado")} en el filtro`}
        </p>
      </div>

      {vista === "tablero" ? (
      <PipelineBoard
        leads={openLeads.map((l) => ({
          id: l.id,
          name: l.name,
          company: l.company,
          stage: l.stage,
          ownerName: users.get(l.owner_id)?.name ?? "sin responsable",
          nextAction: l.next_action,
          nextActionLabel: l.next_action_date ? dueLabel(l.next_action_date, today) : "",
          overdue: l.next_action_date !== null && l.next_action_date < today,
          missing: !l.next_action || !l.next_action_date,
          valueCents: l.potential_value_cents,
          currency: l.potential_currency,
          valueBaseCents: toBase(l.potential_value_cents, l.potential_currency, fx),
          phone: l.contact_phone,
          email: l.contact_email,
        }))}
        monedaBase={fx.base}
      />
      ) : (
      <Card title="Todas las oportunidades del filtro" subtitle={`${plural(leads.length, "resultado")}.`}>
        {leads.length === 0 ? (
          <EmptyState
            title="No hay oportunidades con este filtro"
            action={
              <Link href="/crm/nueva" className="btn btn-primary">
                Cargar la primera
              </Link>
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Empresa / centro</th>
                  <th>Origen</th>
                  <th>Etapa</th>
                  <th>Responsable</th>
                  <th>Próxima acción</th>
                  <th className="text-right">Valor</th>
                  <th className="text-right">Contactar</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const overdue = l.next_action_date !== null && l.next_action_date < today && l.outcome === "open";
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">
                        <Link href={`/crm/${l.id}`} className="font-medium hover:underline">
                          {l.name}
                        </Link>
                      </td>
                      <td className="text-muted">{l.company || "—"}</td>
                      <td className="text-muted">{SOURCE_LABEL[l.source] ?? humanize(l.source)}</td>
                      <td>
                        <Badge
                          tone={l.outcome === "won" ? "ok" : l.outcome === "lost" ? "risk" : "neutral"}
                        >
                          {STAGE_LABEL[l.stage]}
                        </Badge>
                      </td>
                      <td>{users.get(l.owner_id)?.name ?? "—"}</td>
                      <td className={overdue ? "text-risk" : "text-muted"}>
                        {l.next_action ? (
                          <span title={formatDate(l.next_action_date)}>
                            <span className="font-medium">{dueLabel(l.next_action_date, today)}</span>
                            {" · "}
                            {l.next_action}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="tnum text-right">
                        {l.potential_value_cents > 0
                          ? formatMoney(l.potential_value_cents, l.potential_currency)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <ContactActions
                          leadId={l.id}
                          nombre={l.name}
                          empresa={l.company}
                          telefono={l.contact_phone}
                          email={l.contact_email}
                          size="sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
      <Note>
        {vista === "tablero" ? (
          <>
            El tablero muestra lo que está abierto. En escritorio las tarjetas se arrastran entre
            columnas; en celular la flecha las manda a la etapa siguiente. Todo movimiento se puede
            deshacer desde el aviso que aparece abajo. Cerrar como ganada o perdida sí requiere
            abrir la ficha: una venta ganada necesita el cliente cargado y una perdida el motivo.
            Los botones de contacto abren WhatsApp, el teléfono o el mail y dejan registrado el
            intento solos.
          </>
        ) : (
          <>
            La lista muestra todo lo que entra en el filtro, incluidas las ganadas y las perdidas,
            y es la vista para buscar y exportar. Para mover oportunidades de etapa arrastrando,
            volvé al tablero.
          </>
        )}
      </Note>
    </>
  );
}
