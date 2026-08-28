import { requireAdminOr404 } from "@/lib/auth";
import { all } from "@/lib/db";
import { integrationStatuses } from "@/lib/integrations";
import { formatDateTime } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { INTEGRATION_STATUS_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

const PHASE_TONE: Record<string, Tone> = { V1: "ok", V2: "brand", V3: "neutral" };

export default async function IntegracionesPage() {
  await requireAdminOr404();
  const integrations = await integrationStatuses();

  const recent = await all<{
    id: number; source: string; event_type: string; received_at: string;
    processed_at: string | null; result: string;
  }>(
    `SELECT id, source, event_type, received_at, processed_at, result
     FROM integration_events ORDER BY id DESC LIMIT 25`,
  );

  return (
    <>
      <PageHeader
        title="Integraciones"
        description="La arquitectura esta lista para todas. Ninguna es necesaria para que el dashboard funcione: si no esta configurada, la carga sigue siendo manual."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((i) => (
          <Card
            key={i.key}
            title={i.name}
            subtitle={i.description}
            action={<Badge tone={PHASE_TONE[i.phase]}>{i.phase}</Badge>}
          >
            <p className="text-sm">{i.value}</p>

            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Estado</dt>
                <dd>
                  <Badge
                    tone={
                      i.status === "activa" ? "ok" : i.status === "error" ? "risk" : i.configured ? "warn" : "neutral"
                    }
                  >
                    {i.configured ? (INTEGRATION_STATUS_LABEL[i.status] ?? i.status) : "Sin configurar"}
                  </Badge>
                </dd>
              </div>
              {i.inboundPath && (
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Endpoint</dt>
                  <dd className="font-mono text-[0.7rem]">{i.inboundPath}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Variables</dt>
                <dd className="text-right font-mono text-[0.7rem]">{i.envVars.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Eventos recibidos</dt>
                <dd className="tnum">{i.eventCount}</dd>
              </div>
              {i.lastSyncAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Último evento</dt>
                  <dd>{formatDateTime(i.lastSyncAt)}</dd>
                </div>
              )}
              {i.lastError && (
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Último error</dt>
                  <dd className="text-risk">{i.lastError}</dd>
                </div>
              )}
            </dl>

            <p className="mt-3 border-t border-border pt-2 text-xs text-muted">{i.setup}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4" title="Últimos eventos recibidos" subtitle="Todo payload entrante se guarda crudo: se puede auditar y reprocesar.">
        {recent.length === 0 ? (
          <EmptyState
            title="Todavia no llego ningún evento"
            detail="Es lo esperado hasta que se configure la primera integración."
          />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>Fuente</th>
                  <th>Evento</th>
                  <th>Recibido</th>
                  <th>Procesado</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium">{e.source}</td>
                    <td className="text-muted">{e.event_type}</td>
                    <td className="text-muted">{formatDateTime(e.received_at)}</td>
                    <td className="text-muted">{e.processed_at ? formatDateTime(e.processed_at) : "—"}</td>
                    <td>
                      <Badge tone={e.result.startsWith("error") ? "risk" : e.result === "pendiente" ? "warn" : "ok"}>
                        {e.result}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
