"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { RangePreset } from "@/lib/dates";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "personalizado", label: "Personalizado" },
];

/**
 * Filtro de fechas compartido: dia / semana / mes / trimestre / rango
 * personalizado. Escribe en la URL, asi que cualquier vista es compartible
 * y el estado sobrevive al refresh.
 */
export default function RangePicker({
  preset,
  from,
  to,
}: {
  preset: RangePreset;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from, to });

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending || undefined}>
      <div className="inline-flex overflow-hidden rounded-lg border border-border bg-surface">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() =>
              p.key === "personalizado"
                ? apply({ preset: p.key, from: custom.from, to: custom.to })
                : apply({ preset: p.key, from: null, to: null })
            }
            aria-pressed={preset === p.key}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              preset === p.key ? "bg-brand text-white" : "text-muted hover:bg-surface-2"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "personalizado" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className="field w-auto py-1 text-xs"
            value={custom.from}
            max={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
          />
          <span className="text-xs text-faint">a</span>
          <input
            type="date"
            className="field w-auto py-1 text-xs"
            value={custom.to}
            min={custom.from}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
          />
          <button
            type="button"
            className="btn py-1 text-xs"
            onClick={() => apply({ preset: "personalizado", from: custom.from, to: custom.to })}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
