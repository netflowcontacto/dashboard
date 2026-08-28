"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createLead, updateLead } from "@/actions/crm";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { STAGE_LABEL, STAGES, type Lead, type User } from "@/lib/types";

const SOURCES = [
  "meta_ads", "google_ads", "instagram_ads", "pauta",
  "referido", "linkedin", "outbound", "web", "manychat", "otro",
];

const MEETING_OUTCOMES = [
  ["sin_reunion", "Sin reunion"],
  ["agendada", "Agendada"],
  ["realizada", "Realizada"],
  ["no_show", "No-show"],
  ["reprogramada", "Reprogramada"],
  ["cancelada", "Cancelada"],
] as const;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

function dtLocal(value: string | null): string {
  return value ? value.replace(" ", "T").slice(0, 16) : "";
}

/**
 * Ficha de oportunidad. Los tres campos que el CRM no deja vacios
 * (responsable, proxima accion y fecha) estan marcados como obligatorios
 * y la validacion se repite del lado del servidor y de la base.
 */
export default function LeadForm({
  lead,
  users,
  today,
}: {
  lead?: Lead;
  users: User[];
  today: string;
}) {
  const action = lead ? updateLead : createLead;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      {lead && <input type="hidden" name="id" value={lead.id} />}

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Identificacion
        </legend>
        <Field label="Nombre" required>
          <input className="field" name="name" defaultValue={lead?.name} required />
        </Field>
        <Field label="Empresa / medico / centro">
          <input className="field" name="company" defaultValue={lead?.company} />
        </Field>
        <Field label="Especialidad">
          <input className="field" name="specialty" defaultValue={lead?.specialty} />
        </Field>
        <Field label="Email de contacto">
          <input className="field" type="email" name="contact_email" defaultValue={lead?.contact_email} />
        </Field>
        <Field label="Telefono de contacto">
          <input className="field" name="contact_phone" defaultValue={lead?.contact_phone} />
        </Field>
        <Field label="Origen del lead">
          <select className="field" name="source" defaultValue={lead?.source ?? "meta_ads"}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Responsables y estado
        </legend>
        <Field label="Fecha de ingreso" required>
          <input
            className="field"
            type="date"
            name="entered_at"
            defaultValue={lead?.entered_at ?? today}
            required
          />
        </Field>
        <Field label="Responsable" required hint="Quien tiene la proxima accion.">
          <select className="field" name="owner_id" defaultValue={lead?.owner_id ?? ""} required>
            <option value="" disabled>
              Elegir responsable
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Etapa">
          <select className="field" name="stage" defaultValue={lead?.stage ?? "nuevo"}>
            {STAGES.filter((s) => s !== "ganado" && s !== "perdido").map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
            {lead && (lead.stage === "ganado" || lead.stage === "perdido") && (
              <option value={lead.stage}>{STAGE_LABEL[lead.stage]}</option>
            )}
          </select>
        </Field>
        <Field label="Setter" hint="Quien contacto y agendo.">
          <select className="field" name="setter_id" defaultValue={lead?.setter_id ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Closer" hint="Quien lleva la reunion y cierra.">
          <select className="field" name="closer_id" defaultValue={lead?.closer_id ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        {lead && (
          <Field label="Resultado">
            <select className="field" name="outcome" defaultValue={lead.outcome}>
              <option value="open">Abierta</option>
              <option value="won">Ganada</option>
              <option value="lost">Perdida</option>
            </select>
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Proxima accion (obligatoria mientras este abierta)
        </legend>
        <Field label="Proxima accion" required>
          <input
            className="field"
            name="next_action"
            defaultValue={lead?.next_action ?? ""}
            placeholder="Ej: llamar para confirmar reunion"
            required
          />
        </Field>
        <Field label="Fecha de proxima accion" required>
          <input
            className="field"
            type="date"
            name="next_action_date"
            defaultValue={lead?.next_action_date ?? today}
            required
          />
        </Field>
        {lead && (
          <Field label="Motivo de perdida" hint="Obligatorio si el resultado es perdida.">
            <input className="field" name="lost_reason" defaultValue={lead.lost_reason ?? ""} />
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Reunion
        </legend>
        <Field label="Fecha de la reunion">
          <input
            className="field"
            type="datetime-local"
            name="meeting_at"
            defaultValue={dtLocal(lead?.meeting_at ?? null)}
          />
        </Field>
        <Field label="Estado de la reunion">
          <select className="field" name="meeting_outcome" defaultValue={lead?.meeting_outcome ?? "sin_reunion"}>
            {MEETING_OUTCOMES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {lead && (
          <Field label="Realizada el">
            <input
              className="field"
              type="datetime-local"
              name="meeting_held_at"
              defaultValue={dtLocal(lead.meeting_held_at)}
            />
          </Field>
        )}
        {lead && (
          <>
            <Field label="Cantidad de no-shows">
              <input className="field" type="number" min={0} name="no_show_count" defaultValue={lead.no_show_count} />
            </Field>
            <Field label="Recuperado de un no-show">
              <label className="flex items-center gap-2 pt-1.5 text-sm">
                <input type="checkbox" name="recovered_from_noshow" defaultChecked={lead.recovered_from_noshow === 1} />
                Si
              </label>
            </Field>
            <Field label="Propuesta enviada el">
              <input
                className="field"
                type="datetime-local"
                name="proposal_sent_at"
                defaultValue={dtLocal(lead.proposal_sent_at)}
              />
            </Field>
          </>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Oferta
        </legend>
        <Field label="Plan / oferta de interes">
          <input className="field" name="plan_interest" defaultValue={lead?.plan_interest} />
        </Field>
        <Field label="Valor potencial mensual">
          <input
            className="field"
            name="potential_value"
            inputMode="decimal"
            defaultValue={lead ? (lead.potential_value_cents / 100).toString() : ""}
            placeholder="0"
          />
        </Field>
        <Field label="Moneda">
          <select className="field" name="potential_currency" defaultValue={lead?.potential_currency ?? "USD"}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </Field>
      </fieldset>

      <Field label="Notas">
        <textarea className="field" name="notes" rows={3} defaultValue={lead?.notes} />
      </Field>

      <div className="flex gap-2">
        <Submit label={lead ? "Guardar cambios" : "Crear oportunidad"} />
      </div>
    </form>
  );
}
