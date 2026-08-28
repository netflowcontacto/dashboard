"use client";

import { IconDescargar } from "./icons";

/**
 * Descarga en CSV lo que está en pantalla.
 *
 * Sirve para lo que un dashboard no debería intentar reemplazar: pasarle
 * números al contador, cruzar datos en una planilla, armar un reporte puntual.
 */
export default function ExportButton({
  kind,
  from,
  to,
  label = "Exportar CSV",
}: {
  kind: "gastos" | "crm" | "clientes" | "facturas";
  from?: string;
  to?: string;
  label?: string;
}) {
  const params = new URLSearchParams({ tipo: kind });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  return (
    <a href={`/api/exportar?${params.toString()}`} className="btn btn-sm text-muted" download>
      <IconDescargar size={14} />
      {label}
    </a>
  );
}
