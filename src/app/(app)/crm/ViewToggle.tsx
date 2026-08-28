import Link from "next/link";
import { IconLista, IconTablero } from "@/components/icons";

/**
 * Tablero o lista, no las dos cosas apiladas.
 *
 * Antes la página mostraba el tablero y debajo la tabla completa: la misma
 * información dos veces y una página larguísima. Son dos formas de mirar lo
 * mismo, así que se eligen. El tablero muestra lo abierto y sirve para mover;
 * la lista muestra todo lo que entra en el filtro (ganadas y perdidas incluidas)
 * y sirve para buscar y exportar.
 *
 * Son enlaces y no botones a propósito: funcionan antes de que cargue el
 * JavaScript, se pueden abrir en otra pestaña y la vista elegida viaja en la
 * URL, así que un enlace compartido abre lo mismo que estabas mirando.
 */
export default function ViewToggle({
  vista,
  query,
}: {
  vista: "tablero" | "lista";
  query: Record<string, string | string[] | undefined>;
}) {
  function href(destino: "tablero" | "lista") {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k === "vista" || v === undefined) continue;
      sp.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (destino === "lista") sp.set("vista", "lista");
    const qs = sp.toString();
    return qs ? `/crm?${qs}` : "/crm";
  }

  const opciones = [
    { key: "tablero" as const, label: "Tablero", Icon: IconTablero },
    { key: "lista" as const, label: "Lista", Icon: IconLista },
  ];

  return (
    <div
      role="group"
      aria-label="Cómo ver el pipeline"
      className="inline-flex overflow-hidden rounded-lg border border-border bg-surface"
    >
      {opciones.map((o) => (
        <Link
          key={o.key}
          href={href(o.key)}
          aria-current={vista === o.key ? "true" : undefined}
          className={`seg-item gap-1.5 ${
            vista === o.key ? "bg-brand text-white" : "text-muted hover:bg-surface-2"
          }`}
        >
          <o.Icon size={14} />
          {o.label}
        </Link>
      ))}
    </div>
  );
}
