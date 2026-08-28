"use client";

import { useState, useTransition } from "react";
import { moveStage } from "@/actions/crm";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/types";
import { IconFlecha } from "@/components/icons";

const ADVANCEABLE: Stage[] = [
  "nuevo", "contactado", "calificado", "reunion_agendada",
  "reunion_realizada", "propuesta", "follow_up",
];

/**
 * Avanza una oportunidad a la etapa siguiente desde el tablero, sin abrir la
 * ficha. Ganado y perdido no están acá a propósito: cerrar exige cliente o
 * motivo, y eso se hace en la ficha.
 */
export default function QuickStage({ id, stage }: { id: number; stage: Stage }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const index = ADVANCEABLE.indexOf(stage);
  const next = index >= 0 && index < ADVANCEABLE.length - 1 ? ADVANCEABLE[index + 1] : null;

  function move(to: Stage) {
    setOpen(false);
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("stage", to);
    startTransition(() => {
      void moveStage(fd);
    });
  }

  return (
    <div className="relative flex items-center gap-1">
      {next && (
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            move(next);
          }}
          title={`Mover a ${STAGE_LABEL[next]}`}
          className="btn btn-sm btn-ghost px-1.5 text-faint hover:text-brand-ink"
        >
          <IconFlecha size={13} />
          <span className="sr-only">Mover a {STAGE_LABEL[next]}</span>
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="btn btn-sm btn-ghost px-1.5 text-faint hover:text-text"
        title="Mover a otra etapa"
      >
        •••<span className="sr-only">Cambiar etapa</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <ul
            className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-pop"
            role="menu"
          >
            {STAGES.filter((s) => s !== "ganado" && s !== "perdido").map((s) => (
              <li key={s}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.preventDefault();
                    move(s);
                  }}
                  disabled={s === stage}
                  className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                    s === stage ? "bg-brand-soft font-medium text-brand-ink" : "hover:bg-surface-2"
                  }`}
                >
                  {STAGE_LABEL[s]}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
