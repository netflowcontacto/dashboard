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
      {/*
        Es `text` y no `email` a propósito: los accesos son nombres de usuario
        —facundo-netflow— y no direcciones de correo. Con type="email" el
        navegador los rechazaba antes de que el formulario llegara a enviarse.
        `spellCheck` y las mayúsculas automáticas apagadas porque en celular
        convierten "max-netflow" en "Max-netflow" y el login falla sin decir
        por qué.
      */}
      <Field label="Usuario" required>
        <input
          className="field"
          type="text"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="tunombre-netflow"
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
