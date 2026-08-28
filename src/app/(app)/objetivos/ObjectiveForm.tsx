"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { copyObjectives, saveObjective } from "@/actions/objectives";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { AREA_LABEL, type Area, type User } from "@/lib/types";

export interface MetricOption {
  key: string;
  label: string;
  unit: string;
  scope: string;
  higherIsBetter: boolean;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

const UNIT_HINT: Record<string, string> = {
  numero: "cantidad",
  porcentaje: "porcentaje (0-100)",
  moneda: "importe en la moneda base",
  horas: "horas",
};

export default function ObjectiveForm({
  metrics,
  users,
  period,
}: {
  metrics: MetricOption[];
  users: User[];
  period: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveObjective, {});
  const [scope, setScope] = useState<"empresa" | "area" | "persona">("empresa");
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? "");

  const selected = metrics.find((m) => m.key === metricKey);

  // Al elegir persona o area, mostramos solo las métricas que tienen sentido
  // para ese ambito, para que nadie cargue "MRR total" como objetivo de Max.
  const visible = metrics.filter((m) => (scope === "empresa" ? m.scope === "empresa" : true));

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-3">
        <ErrorBanner message={state.error} />
        <SuccessBanner message={state.ok} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Período" required hint="Formato AAAA-MM.">
            <input className="field" name="period" defaultValue={period} pattern="\d{4}-\d{2}" required />
          </Field>

          <Field label="Alcance" required>
            <select
              className="field"
              name="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="empresa">Empresa</option>
              <option value="area">Area</option>
              <option value="persona">Persona</option>
            </select>
          </Field>

          {scope === "area" && (
            <Field label="Area" required>
              <select className="field" name="area" defaultValue="closer">
                {(Object.keys(AREA_LABEL) as Area[]).map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABEL[a]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {scope === "persona" && (
            <Field label="Persona" required>
              <select className="field" name="user_id" defaultValue="">
                <option value="" disabled>
                  Elegir
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {AREA_LABEL[u.area]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Métrica" required hint="El resultado se calcula solo desde los datos del sistema.">
            <select
              className="field"
              name="metric_key"
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
              required
            >
              {visible.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Objetivo"
            required
            hint={
              selected
                ? `${UNIT_HINT[selected.unit] ?? selected.unit}${selected.higherIsBetter ? "" : " · más bajo es mejor"}`
                : undefined
            }
          >
            <input className="field" name="target_value" inputMode="decimal" required placeholder="5" />
          </Field>

          <Field label="Peso" hint="Cuánto pesa dentro de la barra de progreso.">
            <input className="field" name="weight" inputMode="decimal" defaultValue="1" />
          </Field>

          <Field label="Etiqueta" hint="Opcional: como querés que se lea en el dashboard.">
            <input className="field" name="label" placeholder={selected?.label} />
          </Field>
        </div>

        <Submit label="Guardar objetivo" />
      </form>

      <form action={copyObjectives} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <Field label="Copiar objetivos desde">
          <input className="field w-32" name="from_period" defaultValue={period} pattern="\d{4}-\d{2}" />
        </Field>
        <Field label="hacia">
          <input className="field w-32" name="to_period" pattern="\d{4}-\d{2}" placeholder="AAAA-MM" />
        </Field>
        <button type="submit" className="btn">
          Copiar al período
        </button>
      </form>
    </div>
  );
}
