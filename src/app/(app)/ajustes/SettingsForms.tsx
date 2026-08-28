"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveFxSettings, saveOperationalSettings } from "@/actions/finance";
import { saveUser, toggleUserActive } from "@/actions/users";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { AREA_LABEL, type Area, type User } from "@/lib/types";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function FxForm({ rate, base }: { rate: number; base: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveFxSettings, {});

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      <p className="text-xs text-muted">
        Los importes se guardan siempre en su moneda original. El tipo de cambio se usa solo para
        consolidar los totales, así que cambiarlo no altera ningún dato cargado.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de cambio de referencia" required hint="Cuántos ARS equivalen a 1 USD.">
          <input className="field" name="fx_ars_per_usd" inputMode="decimal" defaultValue={rate} required />
        </Field>
        <Field label="Moneda de consolidación">
          <select className="field" name="base_currency" defaultValue={base}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </Field>
      </div>
      <Submit label="Guardar" />
    </form>
  );
}

export function OperationalForm({
  sla,
  followUpDays,
  paidSources,
  visibilidad,
}: {
  sla: string;
  followUpDays: string;
  paidSources: string;
  visibilidad: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveOperationalSettings, {});

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SLA de primer contacto (horas)" hint="Pasado ese tiempo, el lead genera alerta.">
          <input className="field" name="sla_primer_contacto_horas" inputMode="numeric" defaultValue={sla} />
        </Field>
        <Field label="Días sin follow-up de propuesta" hint="Cuando avisar que una propuesta se enfría.">
          <input className="field" name="dias_follow_up_propuesta" inputMode="numeric" defaultValue={followUpDays} />
        </Field>
      </div>
      <Field
        label="Origenes considerados pauta paga"
        hint="Separados por coma. Definen que leads entran en el CPL de Paid Media."
      >
        <input className="field" name="paid_lead_sources" defaultValue={paidSources} />
      </Field>
      <Submit label="Guardar" />
    </form>
  );
}

export function UserForm({ users, currentUserId }: { users: User[]; currentUserId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveUser, {});

  return (
    <div className="space-y-5">
      <div className="scroll-x">
        <table className="nf">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Area</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">
                  {u.name}
                  {u.job_title && <p className="text-xs text-faint">{u.job_title}</p>}
                </td>
                <td className="text-muted">{u.email}</td>
                <td className="text-muted">{u.role === "admin" ? "Administrador" : "Equipo"}</td>
                <td className="text-muted">{AREA_LABEL[u.area]}</td>
                <td className="text-muted">{u.active ? "Activo" : "Inactivo"}</td>
                <td className="text-right">
                  {u.id !== currentUserId && (
                    <form action={toggleUserActive}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" className="btn py-0.5 text-xs">
                        {u.active ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={formAction} className="space-y-3 border-t border-border pt-4">
        <ErrorBanner message={state.error} />
        <SuccessBanner message={state.ok} />
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Alta de persona</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre" required>
            <input className="field" name="name" required />
          </Field>
          <Field label="Email" required>
            <input className="field" type="email" name="email" required />
          </Field>
          <Field label="Contraseña inicial" required hint="Mínimo 8 caracteres.">
            <input className="field" type="password" name="password" minLength={8} required />
          </Field>
          <Field label="Rol" hint="Administrador ve finanzas y toda la empresa.">
            <select className="field" name="role" defaultValue="member">
              <option value="member">Equipo</option>
              <option value="admin">Administrador</option>
            </select>
          </Field>
          <Field label="Area" required>
            <select className="field" name="area" defaultValue="setter">
              {(Object.keys(AREA_LABEL) as Area[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Puesto">
            <input className="field" name="job_title" placeholder="Ej: Setter" />
          </Field>
        </div>
        <Submit label="Crear persona" />
      </form>
    </div>
  );
}
