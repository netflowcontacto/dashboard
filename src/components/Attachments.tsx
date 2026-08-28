"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { removeAttachment, uploadAttachment, type AttachmentRow, type AttachTo } from "@/actions/attachments";
import type { ActionState } from "@/lib/errors";
import { ErrorBanner, SuccessBanner } from "./ui";
import { IconDescargar, IconMas, IconCerrar } from "./icons";

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
      {pending ? "Subiendo…" : (<><IconMas size={13} /> Adjuntar</>)}
    </button>
  );
}

/**
 * Adjuntos de una oportunidad, un cliente o una tarea.
 *
 * Sube al enviar el formulario y no con arrastrar-y-soltar a propósito: un
 * input de archivo funciona igual en el celular, que es donde el equipo va a
 * cargar la mayoría de las cosas.
 */
export default function Attachments({
  kind,
  ownerId,
  items,
  canEdit,
}: {
  kind: AttachTo;
  ownerId: number;
  items: AttachmentRow[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadAttachment, {});
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <ErrorBanner message={state.error} />
      <SuccessBanner message={state.ok} />

      {items.length === 0 ? (
        <p className="mb-3 text-sm text-muted">Todavía no hay archivos adjuntos.</p>
      ) : (
        <ul className="mb-3 divide-y divide-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <a
                href={`/api/archivos/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                <IconDescargar size={14} className="shrink-0 text-faint" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.filename}</span>
                  <span className="block text-xs text-faint">
                    {bytes(a.size_bytes)}
                    {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""}
                  </span>
                </span>
              </a>
              {canEdit && (
                <form action={removeAttachment}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm shrink-0 text-faint hover:text-risk"
                    aria-label={`Quitar ${a.filename}`}
                  >
                    <IconCerrar size={13} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="owner_id" value={ownerId} />
          <input
            ref={inputRef}
            type="file"
            name="file"
            required
            className="field flex-1 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs"
            aria-label="Elegir archivo"
          />
          <UploadButton />
        </form>
      )}
      {canEdit && (
        <p className="mt-1.5 text-xs text-faint">
          Hasta 15 MB. Imágenes, PDF, Word, Excel, PowerPoint, CSV, texto y ZIP.
        </p>
      )}
    </div>
  );
}
