"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createLead, updateLead } from "@/actions/crm";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { SOURCE_LABEL, STAGE_LABEL, STAGES, humanize, type Lead, type User } from "@/lib/types";

const SOURCES = [
  "meta_ads", "google_ads", "instagram_ads", "pauta",
  "referido", "linkedin", "outbound", "web", "manychat", "otro",
];

const OUTCOME_LABEL: Record<string, string> = {
  open: "Abierta",
  won: "Ganada",
  lost: "Perdida",
};

const MEETING_OUTCOMES = [
  ["sin_reunion", "Sin reunión"],
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
 * Sección plegable.
 *
 * Veinte campos de golpe hacen que la gente cargue mal o directamente no
 * cargue. Arriba queda lo mínimo para que la oportunidad exista y sea
 * accionable; el resto se abre solo si hace falta. Se usa <details> nativo:
 * funciona sin JavaScript y el navegador ya sabe cómo comportarse.
 */
function Seccion({
  titulo,
  hint,
  abierta = false,
  children,
}: {
  titulo: string;
  hint?: string;
  abierta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={abierta} className="rounded-xl border border-border bg-surface-2/40">
      <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-medium marker:content-[''] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>
            {titulo}
            {hint && <span className="ml-2 text-xs font-normal text-faint">{hint}</span>}
          </span>
          <span aria-hidden className="text-faint transition-transform">▾</span>
        </span>
      </summary>
      <div className="border-t border-border px-3.5 py-3.5">{children}</div>
    </details>
  );
}

/**
 * Ficha de oportunidad. Los tres campos que el CRM no deja vacios
 * (responsable, próxima acción y fecha) están marcados como obligatorios
 * y la validación se repite del lado del servidor y de la base.
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
      {lead && (
        <>
          <input type="hidden" name="id" value={lead.id} />
          {/* La versión con la que se dibujó el formulario: si cambió mientras
              tanto, el guardado se rechaza en vez de pisar en silencio. */}
          <input type="hidden" name="version" value={lead.updated_at} />
        </>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Lo mínimo para empezar
        </legend>
        <Field label="Nombre" required>
          <input className="field" name="name" defaultValue={lead?.name} required />
        </Field>
        <Field label="Empresa / médico / centro">
          <input className="field" name="company" defaultValue={lead?.company} />
        </Field>
        <Field label="Especialidad">
          <input className="field" name="specialty" defaultValue={lead?.specialty} />
        </Field>
        <Field label="Origen del lead">
          <select className="field" name="source" defaultValue={lead?.source ?? "meta_ads"}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s] ?? humanize(s)}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <Seccion
        titulo="Datos de contacto"
        hint="email y teléfono"
        abierta={Boolean(lead?.contact_email || lead?.contact_phone)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email de contacto">
            <input className="field" type="email" name="contact_email" defaultValue={lead?.contact_email} />
          </Field>
          <Field label="Teléfono de contacto">
            <input className="field" name="contact_phone" defaultValue={lead?.contact_phone} />
          </Field>
        </div>
      </Seccion>

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
        <Field label="Responsable" required hint="Quién tiene la próxima acción.">
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
        <Field label="Setter" hint="Quién contactó y agendó.">
          <select className="field" name="setter_id" defaultValue={lead?.setter_id ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Closer" hint="Quién lleva la reunión y cierra.">
          <select className="field" name="closer_id" defaultValue={lead?.closer_id ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        {/*
          El resultado se muestra pero no se edita acá. Cerrar una oportunidad
          tiene consecuencias que un select no puede cumplir: una ganada
          necesita el cliente dado de alta y enlazado —si no, el funnel cuenta
          un cliente que no existe y rompe el CAC y el MRR nuevo— y una perdida
          necesita el motivo. Las dos cosas viven en la tarjeta de Cierre, que
          hace el trabajo completo.
        */}
        {lead && (
          <Field label="Resultado" hint="Se cambia desde la tarjeta de Cierre, a la derecha.">
            <input
              className="field"
              value={OUTCOME_LABEL[lead.outcome] ?? lead.outcome}
              readOnly
              disabled
            />
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Próxima acción (obligatoria mientras esté abierta)
        </legend>
        <Field label="Próxima acción" required>
          <input
            className="field"
            name="next_action"
            defaultValue={lead?.next_action ?? ""}
            placeholder="Ej: llamar para confirmar reunión"
            required
          />
        </Field>
        <Field label="Fecha de próxima acción" required>
          <input
            className="field"
            type="date"
            name="next_action_date"
            defaultValue={lead?.next_action_date ?? today}
            required
          />
        </Field>
        {lead && (
          <Field label="Motivo de pérdida" hint="Obligatorio si la oportunidad se cierra como perdida.">
            <input className="field" name="lost_reason" defaultValue={lead.lost_reason ?? ""} />
          </Field>
        )}
      </fieldset>

      <Seccion titulo="Reunión" hint="cuándo es y cómo salió" abierta={Boolean(lead?.meeting_at)}>
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Fecha de la reunión">
          <input
            className="field"
            type="datetime-local"
            name="meeting_at"
            defaultValue={dtLocal(lead?.meeting_at ?? null)}
          />
        </Field>
        <Field label="Estado de la reunión">
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
      </Seccion>

      <Seccion titulo="Oferta y valor" hint="plan de interés y cuánto vale" abierta={Boolean(lead?.potential_value_cents)}>
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </Seccion>

      <Field label="Notas">
        <textarea className="field" name="notes" rows={3} defaultValue={lead?.notes} />
      </Field>

      <div className="flex gap-2">
        <Submit label={lead ? "Guardar cambios" : "Crear oportunidad"} />
      </div>
    </form>
  );
}
