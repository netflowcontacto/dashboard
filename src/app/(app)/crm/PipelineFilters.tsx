"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { STAGE_LABEL, STAGES, type User } from "@/lib/types";

export default function PipelineFilters({
  users,
  sources,
  current,
}: {
  users: User[];
  sources: string[];
  current: { stage: string; owner: string; outcome: string; source: string; q: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (!value || value === "todas") sp.delete(key);
    else sp.set(key, value);
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  const activos = [
    current.q,
    current.stage !== "todas" ? current.stage : "",
    current.owner,
    current.source !== "todas" ? current.source : "",
  ].filter(Boolean).length;

  return (
    <details className="filtros mb-4 rounded-xl border border-border bg-surface md:border-0 md:bg-transparent">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 py-2.5 text-sm font-medium marker:content-[''] [&::-webkit-details-marker]:hidden">
        <span>
          Filtros
          {activos > 0 && (
            <span className="ml-2 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs text-brand-ink">
              {activos}
            </span>
          )}
        </span>
        <span aria-hidden className="text-faint">▾</span>
      </summary>
      <div className="filtros-cuerpo border-t border-border p-3 md:border-0 md:p-0">
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("q");
        set("q", typeof value === "string" ? value : "");
      }}
    >
      <input
        name="q"
        defaultValue={current.q}
        placeholder="Buscar nombre, empresa, especialidad…"
        className="field w-auto min-w-56 flex-1 py-1.5 text-sm"
        aria-label="Buscar oportunidades"
      />
      <select
        className="field w-auto py-1.5 text-sm"
        value={current.outcome}
        onChange={(e) => set("outcome", e.target.value)}
        aria-label="Estado"
      >
        <option value="open">Abiertas</option>
        <option value="won">Ganadas</option>
        <option value="lost">Perdidas</option>
        <option value="todas">Todas</option>
      </select>
      <select
        className="field w-auto py-1.5 text-sm"
        value={current.stage}
        onChange={(e) => set("stage", e.target.value)}
        aria-label="Etapa"
      >
        <option value="todas">Todas las etapas</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        className="field w-auto py-1.5 text-sm"
        value={current.owner}
        onChange={(e) => set("owner", e.target.value)}
        aria-label="Responsable"
      >
        <option value="">Todos los responsables</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {sources.length > 0 && (
        <select
          className="field w-auto py-1.5 text-sm"
          value={current.source}
          onChange={(e) => set("source", e.target.value)}
          aria-label="Origen"
        >
          <option value="todas">Todos los origenes</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="btn py-1.5 text-sm">
        Buscar
      </button>
    </form>
      </div>
    </details>
  );
}
