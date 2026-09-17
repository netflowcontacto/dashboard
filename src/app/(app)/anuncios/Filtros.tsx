import Link from "next/link";

/**
 * Filtros de la pantalla de anuncios.
 *
 * Son enlaces y no botones: funcionan antes de que cargue el JavaScript, se
 * pueden abrir en otra pestaña, y la vista elegida viaja en la URL — así un
 * enlace compartido abre lo mismo que estabas mirando.
 */
export default function Filtros({
  nivel,
  clienteId,
  clientes,
}: {
  nivel: "campaña" | "anuncio";
  clienteId?: number;
  clientes: { id: number; name: string }[];
}) {
  const href = (cambios: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    // El nivel viaja siempre explícito: sin él la pantalla elige sola, y
    // entonces hacer clic en "Por anuncio" podría devolver la vista de campañas.
    const base = { nivel, cliente: clienteId ? String(clienteId) : undefined };
    for (const [k, v] of Object.entries({ ...base, ...cambios })) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/anuncios?${qs}` : "/anuncios";
  };

  const seg = (activo: boolean) =>
    `seg-item ${activo ? "bg-brand text-white" : "text-muted hover:bg-surface-2"}`;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div
        role="group"
        aria-label="Nivel de detalle"
        className="inline-flex overflow-hidden rounded-lg border border-border bg-surface"
      >
        <Link href={href({ nivel: "anuncio" })} className={seg(nivel === "anuncio")}>
          Por anuncio
        </Link>
        <Link href={href({ nivel: "campaña" })} className={seg(nivel === "campaña")}>
          Por campaña
        </Link>
      </div>

      {clientes.length > 0 && (
        <div className="scroll-x">
          <div
            role="group"
            aria-label="Cliente"
            className="inline-flex min-w-max overflow-hidden rounded-lg border border-border bg-surface"
          >
            <Link href={href({ cliente: undefined })} className={seg(!clienteId)}>
              Todos
            </Link>
            {clientes.map((c) => (
              <Link key={c.id} href={href({ cliente: String(c.id) })} className={seg(clienteId === c.id)}>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
