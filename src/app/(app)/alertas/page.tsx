import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { alertsFor, SEVERITY_LABEL, type AlertSeverity } from "@/lib/alerts";
import { todayISO } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONE: Record<AlertSeverity, "risk" | "warn" | "neutral"> = {
  urgente: "risk",
  atencion: "warn",
  info: "neutral",
};

const KIND_LABEL: Record<string, string> = {
  lead_sin_contactar: "Leads sin contactar",
  lead_sin_proxima_accion: "Sin próxima acción",
  accion_vencida: "Acciones vencidas",
  reunion_proxima: "Reuniones próximas",
  no_show: "No-shows",
  propuesta_sin_follow_up: "Propuestas sin follow-up",
  pago_pendiente: "Cobros pendientes",
  cliente_en_riesgo: "Clientes en riesgo",
  cliente_atencion: "Clientes en atención",
  onboarding_trabado: "Onboarding trabado",
  tarea_vencida: "Tareas vencidas",
  bloqueo: "Bloqueos",
  objetivo_atrasado: "Objetivos atrasados",
  campana_con_problema: "Campañas con problema",
};

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = sp.mias === "1";

  const all = alertsFor(user, todayISO());
  const alerts = mine ? all.filter((a) => a.ownerId === user.id) : all;

  const counts = {
    urgente: alerts.filter((a) => a.severity === "urgente").length,
    atencion: alerts.filter((a) => a.severity === "atencion").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  const grouped = alerts.reduce<Record<string, typeof alerts>>((acc, a) => {
    (acc[a.kind] ??= []).push(a);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Se calculan en vivo sobre el estado real. Cuando el problema se resuelve, la alerta desaparece sola."
      >
        <Link href={mine ? "/alertas" : "/alertas?mias=1"} className="btn">
          {mine ? "Ver todas" : "Solo las mias"}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Urgentes" value={counts.urgente} tone={counts.urgente ? "risk" : "ok"} />
        <StatCard label="Atención" value={counts.atencion} tone={counts.atencion ? "warn" : "ok"} />
        <StatCard label="Informativas" value={counts.info} />
      </div>

      {alerts.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title="No hay alertas abiertas"
            detail="Todo lo que el sistema vigila esta en orden en este momento."
          />
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {Object.entries(grouped).map(([kind, items]) => (
            <Card key={kind} title={KIND_LABEL[kind] ?? kind} subtitle={`${items.length} caso(s).`}>
              <ul className="divide-y divide-border">
                {items.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={a.href} className="text-sm font-medium hover:underline">
                        {a.title}
                      </Link>
                      <p className="text-xs text-muted">{a.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.ownerName && <Badge tone="neutral">{a.ownerName}</Badge>}
                      <Badge tone={TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {!can(user, "finanzas:ver") && (
        <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Las alertas de cobros y facturación son de dirección y no aparecen en esta vista.
        </p>
      )}
    </>
  );
}
