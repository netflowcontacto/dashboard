"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveClient, setAccountHealth } from "@/actions/clients";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import type { Client, User } from "@/lib/types";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

/** Ficha completa: solo direccion (incluye fee y estado de cobro). */
export default function ClientForm({
  client,
  users,
  today,
}: {
  client?: Client;
  users: User[];
  today: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveClient, {});

  return (
    <form action={formAction} className="space-y-5">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      {client && <input type="hidden" name="id" value={client.id} />}

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Cuenta</legend>
        <Field label="Nombre" required>
          <input className="field" name="name" defaultValue={client?.name} required />
        </Field>
        <Field label="Especialidad">
          <input className="field" name="specialty" defaultValue={client?.specialty} />
        </Field>
        <Field label="Plan contratado">
          <input className="field" name="plan" defaultValue={client?.plan} />
        </Field>
        <Field label="Fee mensual" required>
          <input
            className="field"
            name="fee"
            inputMode="decimal"
            defaultValue={client ? String(client.fee_cents / 100) : ""}
            required
          />
        </Field>
        <Field label="Moneda">
          <select className="field" name="fee_currency" defaultValue={client?.fee_currency ?? "USD"}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </Field>
        <Field label="Fecha de alta" required>
          <input
            className="field"
            type="date"
            name="start_date"
            defaultValue={client?.start_date ?? today}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Cobro</legend>
        <Field label="Proximo cobro">
          <input className="field" type="date" name="next_charge_date" defaultValue={client?.next_charge_date ?? ""} />
        </Field>
        <Field label="Estado de pago">
          <select className="field" name="payment_status" defaultValue={client?.payment_status ?? "al_dia"}>
            <option value="al_dia">Al dia</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencido">Vencido</option>
          </select>
        </Field>
        <Field label="Fecha de renovacion">
          <input className="field" type="date" name="renewal_date" defaultValue={client?.renewal_date ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Operacion</legend>
        <Field label="Responsable Paid Media">
          <select className="field" name="paid_media_owner_id" defaultValue={client?.paid_media_owner_id ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsable Setter">
          <select className="field" name="setter_owner_id" defaultValue={client?.setter_owner_id ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado de onboarding">
          <select className="field" name="onboarding_status" defaultValue={client?.onboarding_status ?? "pendiente"}>
            <option value="pendiente">Pendiente</option>
            <option value="en_curso">En curso</option>
            <option value="completo">Completo</option>
          </select>
        </Field>
        <Field label="Estado general (semaforo)">
          <select className="field" name="account_health" defaultValue={client?.account_health ?? "bien"}>
            <option value="bien">Bien</option>
            <option value="atencion">Atencion</option>
            <option value="riesgo">Riesgo</option>
          </select>
        </Field>
        <Field label="Alertas / problemas">
          <input className="field" name="alerts_note" defaultValue={client?.alerts_note} />
        </Field>
        <div className="flex flex-wrap items-center gap-4 pt-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="dev_required" defaultChecked={client?.dev_required === 1} />
            Requiere desarrollo
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="landing" defaultChecked={client?.landing === 1} />
            Landing
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Baja</legend>
        <Field label="Fecha de baja">
          <input className="field" type="date" name="churned_at" defaultValue={client?.churned_at ?? ""} />
        </Field>
        <Field label="Motivo de baja" hint="Obligatorio si se carga una fecha de baja.">
          <input className="field" name="churn_reason" defaultValue={client?.churn_reason ?? ""} />
        </Field>
      </fieldset>

      <Field label="Notas">
        <textarea className="field" name="notes" rows={3} defaultValue={client?.notes} />
      </Field>

      <Submit label={client ? "Guardar cambios" : "Crear cliente"} />
    </form>
  );
}

/** Version reducida para el equipo: semaforo + onboarding, sin numeros. */
export function AccountHealthForm({ client }: { client: Client }) {
  return (
    <form action={setAccountHealth} className="space-y-3">
      <input type="hidden" name="id" value={client.id} />
      <Field label="Estado general">
        <select className="field" name="account_health" defaultValue={client.account_health}>
          <option value="bien">Bien</option>
          <option value="atencion">Atencion</option>
          <option value="riesgo">Riesgo</option>
        </select>
      </Field>
      <Field label="Estado de onboarding">
        <select className="field" name="onboarding_status" defaultValue={client.onboarding_status}>
          <option value="pendiente">Pendiente</option>
          <option value="en_curso">En curso</option>
          <option value="completo">Completo</option>
        </select>
      </Field>
      <Field label="Alertas / problemas">
        <input className="field" name="alerts_note" defaultValue={client.alerts_note} />
      </Field>
      <Submit label="Actualizar estado" />
    </form>
  );
}
