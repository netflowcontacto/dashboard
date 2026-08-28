"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  group: string;
}

/**
 * Navegacion lateral. Los items ya llegan filtrados por permisos desde el
 * layout (server), asi que aca no se decide visibilidad: solo se pinta.
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

  const groups = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <button
        type="button"
        className="btn fixed left-3 top-3 z-40 md:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="nav-principal"
      >
        {open ? "Cerrar" : "Menu"}
      </button>

      <nav
        id="nav-principal"
        className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 overflow-y-auto border-r border-border bg-surface transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-border px-4 py-4 pt-16 md:pt-4">
          <Link href="/" className="block">
            <span className="text-base font-semibold tracking-tight">NetFlow</span>
            <span className="mt-0.5 block text-xs text-faint">Centro de control</span>
          </Link>
        </div>

        <div className="px-2 py-3">
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group} className="mb-3">
              <p className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
                {group}
              </p>
              {groupItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors ${
                    isActive(item.href)
                      ? "bg-brand-soft font-medium text-brand"
                      : "text-muted hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.href === "/alertas" && alertCount > 0 && (
                    <span className="rounded-full bg-risk px-1.5 text-[0.65rem] font-semibold text-white">
                      {alertCount > 99 ? "99+" : alertCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 border-t border-border bg-surface px-4 py-3">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-faint">{user.jobTitle || user.role}</p>
          <form action="/api/logout" method="post" className="mt-2">
            <button type="submit" className="btn w-full py-1 text-xs">
              Cerrar sesion
            </button>
          </form>
        </div>
      </nav>

      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </>
  );
}
