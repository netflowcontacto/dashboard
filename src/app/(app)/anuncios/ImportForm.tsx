"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importarCsvMeta, type ResultadoImport } from "@/actions/importar";
import { ErrorBanner, Field, SuccessBanner } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Importando…" : "Importar"}
    </button>
  );
}

/**
 * Subir el informe de Meta Ads Manager.
 *
 * Las instrucciones están en la pantalla y no en un manual aparte: es una
 * tarea que se hace una vez por semana, y nadie se acuerda de qué desglose
 * había que tildar al exportar.
 */
export default function ImportForm({ clientes }: { clientes: { id: number; name: string }[] }) {
  const [estado, action] = useActionState<ResultadoImport, FormData>(importarCsvMeta, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorBanner message={estado.error} />
      {estado.ok && <SuccessBanner message={estado.ok} />}

      <ol className="space-y-1.5 text-sm leading-relaxed text-muted">
        <li>
          <strong className="text-text">1.</strong> En Meta Ads Manager, elegí el rango de fechas y
          apretá <em>Informes</em> → <em>Exportar</em>.
        </li>
        <li>
          <strong className="text-text">2.</strong> Tildá el desglose <strong>por día</strong>. Sin
          eso el archivo trae un solo total y no se puede ver la evolución.
        </li>
        <li>
          <strong className="text-text">3.</strong> Exportá a CSV y subilo acá. Si el informe llega a
          nivel anuncio, se importa a nivel anuncio; si llega a nivel campaña, a nivel campaña.
        </li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cliente" required>
          <select className="field" name="client_id" required defaultValue="">
            <option value="" disabled>
              Elegí uno
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Moneda de la cuenta" hint="En la que factura Meta esa cuenta.">
          <select className="field" name="moneda" defaultValue="ARS">
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </Field>

        <Field label="Archivo" required>
          <input className="field" type="file" name="archivo" accept=".csv,text/csv" required />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <span className="text-xs text-faint">
          Subir dos veces el mismo período no duplica el gasto: reemplaza.
        </span>
      </div>

      {estado.descartadas && estado.descartadas.length > 0 && (
        <div className="rounded-lg border border-warn-soft bg-warn-soft px-3 py-2.5">
          <p className="text-sm font-medium text-warn">
            {estado.descartadas.length === 1
              ? "Una línea no se pudo leer"
              : `${estado.descartadas.length} líneas no se pudieron leer`}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-warn">
            {estado.descartadas.slice(0, 8).map((d) => (
              <li key={d.linea}>
                Línea {d.linea}: {d.motivo}
              </li>
            ))}
          </ul>
          {estado.descartadas.length > 8 && (
            <p className="mt-1 text-xs text-warn">…y {estado.descartadas.length - 8} más.</p>
          )}
        </div>
      )}
    </form>
  );
}
