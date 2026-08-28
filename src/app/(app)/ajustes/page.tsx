import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { fxRate, baseCurrency } from "@/lib/fx";
import { usersList } from "@/lib/queries";
import { METRICS } from "@/lib/metrics/registry";
import { Card, PageHeader } from "@/components/ui";
import { FxForm, OperationalForm, UserForm } from "./SettingsForms";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const user = await requireAdmin();

  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Moneda, reglas operativas y accesos. Solo dirección."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Moneda y tipo de cambio">
          <FxForm rate={fxRate()} base={baseCurrency()} />
        </Card>
        <Card title="Reglas operativas" subtitle="Definen cuando el sistema levanta una alerta.">
          <OperationalForm
            sla={getSetting("sla_primer_contacto_horas", "24")}
            followUpDays={getSetting("dias_follow_up_propuesta", "5")}
            paidSources={getSetting("paid_lead_sources", "meta_ads,google_ads,instagram_ads,pauta")}
          />
        </Card>
      </div>

      <Card className="mt-4" title="Equipo y accesos">
        <UserForm users={usersList()} currentUserId={user.id} />
      </Card>

      <Card
        className="mt-4"
        title="Métricas disponibles"
        subtitle="Cada una se puede usar como objetivo. El resultado se calcula solo, nunca se carga a mano."
      >
        <div className="scroll-x">
          <table className="nf">
            <thead>
              <tr>
                <th>Métrica</th>
                <th>Clave</th>
                <th>Ambito</th>
                <th>Unidad</th>
                <th>Dirección</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key}>
                  <td className="font-medium">
                    {m.label}
                    {m.help && <p className="text-xs text-muted">{m.help}</p>}
                  </td>
                  <td className="font-mono text-xs text-faint">{m.key}</td>
                  <td className="text-muted">{m.scope}</td>
                  <td className="text-muted">{m.unit}</td>
                  <td className="text-muted">{m.higherIsBetter ? "mas es mejor" : "menos es mejor"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
