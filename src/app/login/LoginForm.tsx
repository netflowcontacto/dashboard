"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "@/actions/auth";
import { ErrorBanner, Field } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <Field label="Email" required>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>
      <Field label="Contraseña" required>
        <input className="field" type="password" name="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton />
    </form>
  );
}
