"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { closeLost, closeWon, logFollowUp, reopenLead } from "@/actions/crm";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import type { Lead, User } from "@/lib/types";

function Submit({ label, tone = "primary" }: { label: string; tone?: "primary" | "danger" | "plain" }) {
  const { pending } = useFormStatus();
  const cls = tone === "primary" ? "btn btn-primary" : tone === "danger" ? "btn btn-danger" : "btn";
  return (
    <button type="submit" className={cls} disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

/** Registrar un follow-up y, de paso, reprogramar la próxima acción. */
export function FollowUpForm({ leadId, today }: { leadId: number; today: string }) {
  return (
    <form action={logFollowUp} className="space-y-3">
      <input type="hidden" name="id" value={leadId} />
      <Field label="Que hiciste">
        <input className="field" name="detail" placeholder="Ej: segundo mensaje por WhatsApp" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Próxima acción">
          <input className="field" name="next_action" placeholder="Ej: llamar el lunes" />
        </Field>
        <Field label="Fecha">
          <input className="field" type="date" name="next_action_date" defaultValue={today} />
        </Field>
      </div>
      <Submit label="Registrar follow-up" tone="plain" />
    </form>
  );
}

/** Cierre como ganada: crea el cliente en el mismo paso. */
export function CloseWonForm({
  lead,
  users,
  today,
}: {
  lead: Lead;
  users: User[];
  today: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(closeWon, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary w-full" onClick={() => setOpen(true)}>
        Cerrar como ganada
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      <input type="hidden" name="id" value={lead.id} />
      <p className="text-xs text-muted">
        Al cerrar se da de alta el cliente automáticamente. Así nunca queda una venta ganada sin cliente
        cargado, que es lo que rompe el MRR y el CAC.
      </p>
      <Field label="Nombre del cliente" required>
        <input className="field" name="client_name" defaultValue={lead.company || lead.name} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan contratado">
          <input className="field" name="plan" defaultValue={lead.plan_interest} />
        </Field>
        <Field label="Fecha de alta" required>
          <input className="field" type="date" name="start_date" defaultValue={today} required />
        </Field>
        <Field label="Fee mensual" required>
          <input
            className="field"
            name="fee"
            inputMode="decimal"
            defaultValue={lead.potential_value_cents ? String(lead.potential_value_cents / 100) : ""}
            required
          />
        </Field>
        <Field label="Moneda">
          <select className="field" name="fee_currency" defaultValue={lead.potential_currency}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </Field>
        <Field label="Próximo cobro">
          <input className="field" type="date" name="next_charge_date" />
        </Field>
        <Field label="Responsable Paid Media">
          <select className="field" name="paid_media_owner_id" defaultValue="">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="dev_required" /> Requiere desarrollo
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="landing" /> Lleva landing
        </label>
      </div>
      <div className="flex gap-2">
        <Submit label="Cerrar y crear cliente" />
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CloseLostForm({ leadId }: { leadId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(closeLost, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-danger w-full" onClick={() => setOpen(true)}>
        Cerrar como perdida
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <input type="hidden" name="id" value={leadId} />
      <Field label="Motivo de perdida" required hint="Sin motivo no se puede cerrar: es como aprendemos.">
        <input className="field" name="lost_reason" required autoFocus />
      </Field>
      <div className="flex gap-2">
        <Submit label="Confirmar perdida" tone="danger" />
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ReopenForm({ leadId, today }: { leadId: number; today: string }) {
  return (
    <form action={reopenLead} className="space-y-3">
      <input type="hidden" name="id" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Próxima acción">
          <input className="field" name="next_action" defaultValue="Retomar contacto" />
        </Field>
        <Field label="Fecha">
          <input className="field" type="date" name="next_action_date" defaultValue={today} />
        </Field>
      </div>
      <Submit label="Reabrir oportunidad" tone="plain" />
    </form>
  );
}
