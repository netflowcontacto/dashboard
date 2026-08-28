"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconBuscar, IconCerrar } from "./icons";
import type { SearchHit } from "@/app/api/buscar/route";

export interface QuickLink {
  href: string;
  label: string;
  group: string;
}

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  oportunidad: "Oportunidad",
  cliente: "Cliente",
  tarea: "Tarea",
};

/**
 * Paleta de comandos (Ctrl/Cmd + K).
 *
 * Con 200 oportunidades cargadas, encontrar una scrolleando deja de ser
 * viable. Busca oportunidades, clientes y tareas, y sirve además de atajo
 * a cualquier sección — sin salir del teclado.
 */
export default function CommandPalette({ links }: { links: QuickLink[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Búsqueda con debounce: no dispara una petición por tecla.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits ?? []);
        setActive(0);
      } catch {
        /* petición cancelada por una tecla más nueva */
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const matchedLinks = query.trim()
    ? links.filter((l) => l.label.toLowerCase().includes(query.trim().toLowerCase()))
    : links;

  type Row = { key: string; href: string; title: string; subtitle: string; kind: string };
  const rows: Row[] = [
    ...hits.map((h) => ({
      key: `${h.type}-${h.id}`,
      href: h.href,
      title: h.title,
      subtitle: h.subtitle,
      kind: TYPE_LABEL[h.type],
    })),
    ...matchedLinks.map((l) => ({
      key: `link-${l.href}`,
      href: l.href,
      title: l.label,
      subtitle: l.group,
      kind: "Ir a",
    })),
  ];

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      go(rows[active].href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-left text-xs text-faint transition-colors hover:border-border-strong hover:text-muted"
      >
        <IconBuscar size={14} />
        <span className="flex-1">Buscar…</span>
        <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-sans text-[0.65rem]">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Buscar en NetFlow"
          >
            <div className="flex items-center gap-2 border-b border-border px-3.5">
              <IconBuscar size={16} className="shrink-0 text-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar oportunidad, cliente, tarea o sección…"
                className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-faint"
                aria-label="Buscar"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0 text-faint"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <IconCerrar size={14} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-1.5">
              {loading && rows.length === 0 && (
                <p className="px-2.5 py-6 text-center text-xs text-faint">Buscando…</p>
              )}
              {!loading && rows.length === 0 && (
                <p className="px-2.5 py-6 text-center text-xs text-faint">
                  {query.trim().length < 2 ? "Escribí al menos 2 letras." : "Sin resultados."}
                </p>
              )}
              {rows.map((row, i) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => go(row.href)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === active ? "bg-brand-soft" : "hover:bg-surface-2"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    {row.subtitle && <p className="truncate text-xs text-muted">{row.subtitle}</p>}
                  </div>
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-faint">
                    {row.kind}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-3.5 py-2 text-[0.65rem] text-faint">
              <span>↑↓ navegar</span>
              <span>↵ abrir</span>
              <span>esc cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
