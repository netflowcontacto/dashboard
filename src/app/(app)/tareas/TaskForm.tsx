"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveTask } from "@/actions/tasks";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import type { Client, User } from "@/lib/types";

const CATEGORIES: [string, string][] = [
  ["tarea", "Tarea"],
  ["proyecto", "Proyecto"],
  ["landing", "Landing"],
  ["incidencia", "Incidencia"],
  ["correccion", "Corrección"],
  ["contenido", "Pieza de contenido"],
  ["proceso", "Proceso de gestión"],
];

const CHANNELS: [string, string][] = [
  ["", "—"],
  ["linkedin_netflow", "LinkedIn NetFlow"],
  ["linkedin_facundo", "LinkedIn Facundo"],
  ["instagram", "Instagram"],
  ["newsletter", "Newsletter"],
  ["otro", "Otro"],
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Crear"}
    </button>
  );
}

export default function TaskForm({
  users,
  clients,
  defaultAssignee,
}: {
  users: User[];
  clients: Client[];
  defaultAssignee: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveTask, {});
  const [category, setCategory] = useState("tarea");
  const [status, setStatus] = useState("pendiente");

  return (
    <form action={formAction} className="space-y-3">
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Titulo" required>
          <input className="field" name="title" required />
        </Field>
        <Field label="Tipo">
          <select className="field" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsable">
          <select className="field" name="assignee_id" defaultValue={defaultAssignee}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cliente">
          <select className="field" name="client_id" defaultValue="">
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className="field" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pendiente">Pendiente</option>
            <option value="en_curso">En curso</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="hecho">Hecho</option>
          </select>
        </Field>
        <Field label="Prioridad">
          <select className="field" name="priority" defaultValue="media">
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </Field>
        <Field label="Fecha comprometida" hint="Se usa para medir entregas a tiempo.">
          <input className="field" type="date" name="due_date" />
        </Field>

        {category === "contenido" && (
          <>
            <Field label="Canal">
              <select className="field" name="channel" defaultValue="">
                {CHANNELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha planificada">
              <input className="field" type="date" name="planned_date" />
            </Field>
            <Field label="Fecha de publicación">
              <input className="field" type="date" name="published_at" />
            </Field>
          </>
        )}

        {status === "bloqueado" && (
          <Field label="Cual es el bloqueo" required hint="Sin esto no se puede marcar como bloqueada.">
            <input className="field" name="blocker" required />
          </Field>
        )}
      </div>

      <Field label="Descripción">
        <textarea className="field" name="description" rows={2} />
      </Field>

      <Submit />
    </form>
  );
}
