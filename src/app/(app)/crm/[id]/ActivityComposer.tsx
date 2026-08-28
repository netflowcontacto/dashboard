"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { registrarActividad } from "@/actions/actividad";
import { type TipoActividad } from "@/lib/actividad";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { IconEmail, IconNota, IconTelefono, IconWhatsapp, IconCalendario } from "@/components/icons";

const OPCIONES: { tipo: TipoActividad; label: string; Icon: typeof IconNota; placeholder: string }[] = [
  { tipo: "llamada", label: "Llamada", Icon: IconTelefono, placeholder: "Atendió, quedó en revisar la propuesta…" },
  { tipo: "whatsapp", label: "WhatsApp", Icon: IconWhatsapp, placeholder: "Le mandé el resumen de los planes…" },
  { tipo: "email", label: "Email", Icon: IconEmail, placeholder: "Envié la propuesta por mail…" },
  { tipo: "reunion", label: "Reunión", Icon: IconCalendario, placeholder: "Cómo salió la reunión…" },
  { tipo: "nota", label: "Nota", Icon: IconNota, placeholder: "Algo que conviene recordar…" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Registrar"}
    </button>
  );
}

/**
 * Registrar lo que pasó, en un solo paso.
 *
 * Incluye la próxima acción en el mismo formulario a propósito: el estado más
 * común de un CRM abandonado es tener actividad registrada y nada agendado
 * después. Acá cerrar una cosa te propone la siguiente.
 */
export default function ActivityComposer({ leadId, today }: { leadId: number; today: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(registrarActividad, {});
  const [tipo, setTipo] = useState<TipoActividad>("llamada");
  const actual = OPCIONES.find((o) => o.tipo === tipo)!;

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="tipo" value={tipo} />

      <div className="flex flex-wrap gap-1.5">
        {OPCIONES.map((o) => (
          <button
            key={o.tipo}
            type="button"
            onClick={() => setTipo(o.tipo)}
            aria-pressed={tipo === o.tipo}
            className={`btn btn-sm gap-1.5 ${
              tipo === o.tipo ? "border-brand bg-brand-soft text-brand-ink" : "text-muted"
            }`}
          >
            <o.Icon size={13} />
            {o.label}
          </button>
        ))}
      </div>

      <textarea
        className="field"
        name="detalle"
        rows={2}
        required
        placeholder={actual.placeholder}
        aria-label="Qué pasó"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Y ahora qué sigue" hint="Opcional, pero es lo que evita que se enfríe.">
          <input className="field" name="next_action" placeholder="Ej: llamar el lunes" />
        </Field>
        <Field label="Para cuándo">
          <input className="field" type="date" name="next_action_date" defaultValue={today} />
        </Field>
      </div>

      <Submit />
    </form>
  );
}
