"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CommandPalette from "./CommandPalette";
import ThemeToggle from "./ThemeToggle";
import { IconCerrar, IconMenu, IconSalir, NAV_ICONS } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  group: string;
}

/**
 * Navegación lateral. Los items ya llegan filtrados por permisos desde el
 * layout (servidor), así que acá no se decide visibilidad: solo se pinta.
 */
export default function Nav({
  items,
  user,
  alertCount,
}: {
  items: NavItem[];
  user: { name: string; role: string; jobTitle: string };
  alertCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Al navegar en móvil, el panel se cierra solo.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const groups = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="nav-principal"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
        >
          {open ? <IconCerrar size={18} /> : <IconMenu size={18} />}
        </button>
        <span className="font-semibold tracking-tight">NetFlow</span>
        {alertCount > 0 && (
          <Link href="/alertas" className="ml-auto">
            <span className="rounded-full bg-risk px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          </Link>
        )}
      </header>

      <nav
        id="nav-principal"
        aria-label="Navegación principal"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-border px-3 py-3">
          <Link href="/" className="mb-3 flex items-center gap-2 px-1">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg text-sm font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              N
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight tracking-tight">NetFlow</span>
              <span className="block text-[0.65rem] leading-tight text-faint">Centro de control</span>
            </span>
          </Link>
          <CommandPalette links={items.map((i) => ({ href: i.href, label: i.label, group: i.group }))} />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group} className="mb-4 last:mb-0">
              <p className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
                {group}
              </p>
              {groupItems.map((item) => {
                const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-brand-soft font-medium text-brand-ink"
                        : "text-muted hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    {Icon && <Icon size={16} className="shrink-0" />}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.href === "/alertas" && alertCount > 0 && (
                      <span className="shrink-0 rounded-full bg-risk px-1.5 text-[0.65rem] font-semibold text-white">
                        {alertCount > 99 ? "99+" : alertCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t border-border px-3 py-2.5">
          <div className="mb-2 flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[0.7rem] font-semibold text-muted"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-tight">{user.name}</span>
              <span className="block truncate text-[0.65rem] leading-tight text-faint">
                {user.jobTitle || user.role}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <form action="/api/logout" method="post" className="flex-1">
              <button type="submit" className="btn btn-sm w-full text-muted" title="Cerrar sesión">
                <IconSalir size={14} />
                Salir
              </button>
            </form>
          </div>
        </div>
      </nav>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </>
  );
}
