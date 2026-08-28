import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { leadsList, leadSources, userMap, usersList } from "@/lib/queries";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/types";
import { Badge, Card, EmptyState, Note, PageHeader, StatCard, type Tone } from "@/components/ui";
import ExportButton from "@/components/ExportButton";
import PipelineFilters from "./PipelineFilters";
import QuickStage from "./QuickStage";
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

  const leads = leadsList(filters);
  const users = userMap();
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
  const openValue = openLeads.reduce((a, l) => a + l.potential_value_cents, 0);
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
        users={usersList()}
        sources={leadSources()}
        current={{
          stage: filters.stage,
          owner: filters.ownerId ? String(filters.ownerId) : "",
          outcome: filters.outcome,
          source: filters.source,
          q: filters.q ?? "",
        }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <StatCard label="Valor potencial abierto" value={formatMoney(openValue, "USD")} />
      </div>

      {missingData > 0 && (
        <p className="mb-4 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-sm text-warn">
          {missingData} oportunidad(es) abiertas sin próxima acción definida. Son las primeras que hay que ordenar.
        </p>
      )}

      {/* Tablero por etapa */}
      <div className="scroll-x pb-2">
        <div className="flex min-w-max gap-3">
          {OPEN_STAGES.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const total = items.reduce((a, l) => a + l.potential_value_cents, 0);
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                    {STAGE_LABEL[stage]}
                  </h3>
                  <span className="tnum text-xs text-muted">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-faint">
                      Vacio
                    </div>
                  ) : (
                    items.map((l) => {
                      const overdue = l.next_action_date !== null && l.next_action_date < today;
                      const missing = !l.next_action || !l.next_action_date;
                      const tone: Tone = missing ? "warn" : overdue ? "risk" : "neutral";
                      return (
                        <Link
                          key={l.id}
                          href={`/crm/${l.id}`}
                          className="block rounded-lg border border-border bg-surface p-2.5 transition-colors hover:bg-surface-2"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</p>
                            <QuickStage id={l.id} stage={l.stage} />
                          </div>
                          {l.company && <p className="truncate text-xs text-muted">{l.company}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Badge tone="neutral">{users.get(l.owner_id)?.name ?? "sin responsable"}</Badge>
                            {l.potential_value_cents > 0 && (
                              <Badge tone="brand">
                                {formatMoney(l.potential_value_cents, l.potential_currency)}
                              </Badge>
                            )}
                          </div>
                          <p className={`mt-1.5 truncate text-xs ${tone === "neutral" ? "text-faint" : tone === "warn" ? "text-warn" : "text-risk"}`}>
                            {missing
                              ? "Sin próxima acción"
                              : `${overdue ? "Vencida " : ""}${formatDate(l.next_action_date)} · ${l.next_action}`}
                          </p>
                        </Link>
                      );
                    })
                  )}
                </div>
                {total > 0 && (
                  <p className="tnum mt-2 px-1 text-xs text-faint">
                    Potencial: {formatMoney(total, items[0]?.potential_currency ?? "USD")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Listado completo */}
      <Card className="mt-6" title="Todas las oportunidades del filtro" subtitle={`${leads.length} resultado(s).`}>
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
                  <th>Especialidad</th>
                  <th>Origen</th>
                  <th>Etapa</th>
                  <th>Responsable</th>
                  <th>Próxima acción</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const overdue = l.next_action_date !== null && l.next_action_date < today && l.outcome === "open";
                  return (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/crm/${l.id}`} className="font-medium hover:underline">
                          {l.name}
                        </Link>
                      </td>
                      <td className="text-muted">{l.company || "—"}</td>
                      <td className="text-muted">{l.specialty || "—"}</td>
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
                        {l.next_action ? `${formatDate(l.next_action_date)} · ${l.next_action}` : "—"}
                      </td>
                      <td className="tnum text-right">
                        {l.potential_value_cents > 0
                          ? formatMoney(l.potential_value_cents, l.potential_currency)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note>
        La flecha de cada tarjeta la mueve a la etapa siguiente sin abrir la ficha. Cerrar como
        ganada o perdida sí requiere abrirla: una venta ganada necesita el cliente cargado y una
        perdida necesita el motivo.
      </Note>
    </>
  );
}
