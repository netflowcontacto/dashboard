import Link from "next/link";
import { Card, EmptyState } from "./ui";
import { IconAlertas, IconCalendario, IconCheck, IconCrm, IconFlecha } from "./icons";
import type { FocusItem } from "@/lib/focus";

const ICONO = {
  accion: IconCrm,
  reunion: IconCalendario,
  tarea: IconCheck,
  contacto: IconAlertas,
} as const;

const TONO = {
  vencido: "text-risk",
  hoy: "text-warn",
  proximo: "text-muted",
} as const;

/**
 * Lo primero que ve cada persona al entrar.
 *
 * El resto del panel informa; esto dirige. Va arriba de todo y a propósito
 * muestra pocas cosas: una lista de veinte pendientes no se lee, se ignora.
 */
export default function FocusList({ items, nombre }: { items: FocusItem[]; nombre: string }) {
  return (
    <Card
      className="mb-4"
      title="Por dónde empezar hoy"
      subtitle={items.length > 0 ? "Ordenado por lo que más cuesta dejar pasar." : undefined}
    >
      {items.length === 0 ? (
        <EmptyState
          title={`Estás al día, ${nombre}`}
          detail="No hay nada vencido ni para hoy. Buen momento para adelantar lo de la semana."
        />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = ICONO[item.tipo];
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span className={`shrink-0 ${TONO[item.urgencia]}`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.titulo}</span>
                    <span className={`block truncate text-xs ${TONO[item.urgencia]}`}>
                      {item.detalle}
                    </span>
                  </span>
                  <IconFlecha
                    size={15}
                    className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
