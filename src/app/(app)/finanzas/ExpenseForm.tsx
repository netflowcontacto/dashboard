"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveCashSnapshot, saveExpense } from "@/actions/finance";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type Client } from "@/lib/types";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

/**
 * Carga de gastos.
 * `onlyPaidMedia` fija la categoría en inversión publicitaria y esconde el
 * resto: es la vista que usa Paid Media, sin acceso a los demas costos.
 */
export default function ExpenseForm({
  clients,
  today,
  onlyPaidMedia = false,
}: {
  clients: Client[];
  today: string;
  onlyPaidMedia?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveExpense, {});

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Concepto" required>
          <input className="field" name="concept" required placeholder="Ej: campaña Meta agosto" />
        </Field>

        {onlyPaidMedia ? (
          <input type="hidden" name="category" value="paid_media" />
        ) : (
          <Field label="Categoría" required>
            <select className="field" name="category" defaultValue="software" required>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Importe" required>
          <input className="field" name="amount" inputMode="decimal" required placeholder="0" />
        </Field>
        <Field label="Moneda">
          <select className="field" name="currency" defaultValue="ARS">
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <Field label="Fecha" required>
          <input className="field" type="date" name="date" defaultValue={today} required />
        </Field>
        <Field label="Proveedor / persona">
          <input className="field" name="vendor" />
        </Field>

        {!onlyPaidMedia && (
          <>
            <Field label="Tipo">
              <select className="field" name="cost_type" defaultValue="variable">
                <option value="variable">Variable</option>
                <option value="fijo">Fijo</option>
              </select>
            </Field>
            <Field label="Recurrencia">
              <select className="field" name="recurrence" defaultValue="no_recurrente">
                <option value="no_recurrente">No recurrente</option>
                <option value="recurrente">Recurrente</option>
              </select>
            </Field>
            <Field label="Estado">
              <select className="field" name="status" defaultValue="pagado">
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </Field>
          </>
        )}

        <Field label="Cliente asociado" hint="Solo si el gasto corresponde a una cuenta puntual.">
          <select className="field" name="client_id" defaultValue="">
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Plataforma" hint={onlyPaidMedia ? "Meta, Google, etc." : "Solo para inversión publicitaria."}>
          <input className="field" name="platform" defaultValue={onlyPaidMedia ? "meta" : ""} />
        </Field>
        <Field label="Campaña">
          <input className="field" name="campaign" />
        </Field>
      </div>

      {!onlyPaidMedia && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="direct_cost" />
          Es un costo directo del servicio (entra en el margen bruto)
        </label>
      )}
      {onlyPaidMedia && <input type="hidden" name="direct_cost" value="0" />}

      <Field label="Notas">
        <input className="field" name="notes" />
      </Field>

      <Submit label="Registrar gasto" />
    </form>
  );
}

export function CashForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveCashSnapshot, {});

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      <p className="text-xs text-muted">
        La caja se declara a mano por cuenta. Se toma siempre el último saldo cargado de cada una.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cuenta" required>
          <input className="field" name="account" placeholder="Ej: Banco ARS / Wise USD" required />
        </Field>
        <Field label="Saldo" required>
          <input className="field" name="balance" inputMode="decimal" required />
        </Field>
        <Field label="Moneda">
          <select className="field" name="currency" defaultValue="ARS">
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <Field label="Fecha" required>
          <input className="field" type="date" name="date" defaultValue={today} required />
        </Field>
      </div>
      <Submit label="Actualizar caja" />
    </form>
  );
}
