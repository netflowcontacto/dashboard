"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveCampaignAsset } from "@/actions/finance";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Registrar"}
    </button>
  );
}

export default function CampaignAssetForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveCampaignAsset, {});

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required>
          <input className="field" name="name" required placeholder="Ej: video testimonial v3" />
        </Field>
        <Field label="Tipo">
          <select className="field" name="kind" defaultValue="creativo">
            <option value="creativo">Creativo</option>
            <option value="test">Test</option>
          </select>
        </Field>
        <Field label="Plataforma">
          <input className="field" name="platform" defaultValue="meta" />
        </Field>
        <Field label="Campaña">
          <input className="field" name="campaign" />
        </Field>
        <Field label="Fecha" required>
          <input className="field" type="date" name="date" defaultValue={today} required />
        </Field>
        <Field label="Resultado">
          <input className="field" name="result" placeholder="Ej: CPL 8 USD, gano al control" />
        </Field>
      </div>
      <Submit />
    </form>
  );
}
