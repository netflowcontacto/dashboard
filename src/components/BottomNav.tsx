"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./Nav";
import { IconMenu, NAV_ICONS } from "./icons";

/**
 * Navegación inferior, solo en celular.
 *
 * El equipo va a abrir esto con una mano y en el medio de otra cosa. Una barra
 * abajo queda en la zona del pulgar; un menú hamburguesa arriba a la izquierda
 * es justo la esquina más incómoda de alcanzar.
 *
 * Van cuatro destinos y "Más", que abre el menú completo. Cuatro y no seis
 * porque a partir de ahí los objetivos táctiles bajan de 44px.
 */
export default function BottomNav({
  items,
  alertCount,
  onOpenMenu,
}: {
  items: NavItem[];
  alertCount: number;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const primary = items.slice(0, 4);

  return (
    <nav
      aria-label="Navegación rápida"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primary.map((item) => {
        const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.65rem] transition-colors ${
              active ? "text-brand-ink" : "text-faint"
            }`}
          >
            {Icon && <Icon size={20} />}
            <span className="max-w-full truncate leading-tight">{shortLabel(item.label)}</span>
            {item.href === "/alertas" && alertCount > 0 && (
              <span className="absolute right-1/2 top-1.5 translate-x-3 rounded-full bg-risk px-1 text-[0.6rem] font-semibold text-white">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
            {active && (
              <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand" />
            )}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onOpenMenu}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.65rem] text-faint"
      >
        <IconMenu size={20} />
        <span className="leading-tight">Más</span>
      </button>
    </nav>
  );
}

/** Los nombres largos no entran en una barra de cinco columnas. */
function shortLabel(label: string): string {
  const map: Record<string, string> = {
    "Resumen general": "Resumen",
    "Funnel comercial": "Funnel",
    "Tareas y proyectos": "Tareas",
    "Equipo y performance": "Equipo",
    "Inversión publicitaria": "Inversión",
    "Mi panel": "Panel",
  };
  return map[label] ?? label;
}
