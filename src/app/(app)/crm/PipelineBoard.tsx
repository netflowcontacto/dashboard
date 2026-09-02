"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveStage } from "@/actions/crm";
import { revertirEtapa } from "@/actions/actividad";
import { useToast } from "@/components/Toast";
import ContactActions from "@/components/ContactActions";
import { Badge } from "@/components/ui";
import { IconArrastrar, IconFlecha } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL, type Currency, type Stage } from "@/lib/types";

export interface BoardLead {
  id: number;
  name: string;
  company: string;
  stage: Stage;
  ownerName: string;
  nextAction: string | null;
  nextActionLabel: string;
  overdue: boolean;
  missing: boolean;
  valueCents: number;
  currency: Currency;
  /** El mismo valor llevado a la moneda base, para poder sumar la columna. */
  valueBaseCents: number;
  phone: string;
  email: string;
}

const ETAPAS: Stage[] = [
  "nuevo",
  "contactado",
  "calificado",
  "reunion_agendada",
  "reunion_realizada",
  "propuesta",
  "follow_up",
];

/**
 * Tablero del pipeline.
 *
 * Se arrastra en escritorio y se mueve con la flecha en celular, que es donde
 * arrastrar con el dedo pelea con el scroll de la página.
 *
 * El movimiento es optimista: la tarjeta se acomoda en su nueva columna antes
 * de que el servidor conteste. Eso es lo que hace que se sienta instantáneo,
 * y por eso viene siempre acompañado de un aviso con "Deshacer": si la persona
 * no puede revertir un movimiento equivocado, deja de confiar en el tablero.
 * Si el servidor falla, la tarjeta vuelve sola a donde estaba.
 */
export default function PipelineBoard({
  leads: initial,
  monedaBase,
}: {
  leads: BoardLead[];
  monedaBase: Currency;
}) {
  const [leads, setLeads] = useState(initial);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [encima, setEncima] = useState<Stage | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();

  // La lista puede cambiar por un filtro o una recarga del servidor.
  const [snapshot, setSnapshot] = useState(initial);
  if (snapshot !== initial) {
    setSnapshot(initial);
    setLeads(initial);
  }

  function mover(id: number, destino: Stage, origen: Stage) {
    if (destino === origen) return;

    setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage: destino } : l)));

    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("stage", destino);

    startTransition(async () => {
      try {
        const r = await moveStage(fd);
        if (!r.ok) {
          // El servidor no la movió. La tarjeta vuelve y el aviso dice por qué:
          // dejarla en la columna nueva con un "listo" sería mentir.
          setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage: origen } : l)));
          toast({ message: r.error, tone: "error" });
          return;
        }
        toast({
          message: `Movida a ${STAGE_LABEL[destino]}.`,
          onUndo: () => {
            setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage: origen } : l)));
            const undo = new FormData();
            undo.set("lead_id", String(id));
            undo.set("stage", origen);
            void revertirEtapa(undo);
          },
        });
      } catch {
        setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage: origen } : l)));
        toast({ message: "No se pudo mover. Volvió a su lugar.", tone: "error" });
      }
    });
  }

  function siguiente(stage: Stage): Stage | null {
    const i = ETAPAS.indexOf(stage);
    return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
  }

  return (
    <div className="scroll-x pb-2">
      <div className="flex min-w-max gap-3">
        {ETAPAS.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          // Se suma el valor ya convertido: una columna con una oportunidad en
          // pesos y otra en dólares no se puede sumar en crudo.
          const total = items.reduce((a, l) => a + l.valueBaseCents, 0);
          const activa = encima === stage;

          return (
            <div
              key={stage}
              className="w-64 shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
                setEncima(stage);
              }}
              onDragLeave={() => setEncima((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setEncima(null);
                const id = Number(e.dataTransfer.getData("text/plain"));
                const lead = leads.find((l) => l.id === id);
                if (lead) mover(id, stage, lead.stage);
                setArrastrando(null);
              }}
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                  {STAGE_LABEL[stage]}
                </h3>
                <span className="tnum text-xs text-muted">{items.length}</span>
              </div>

              <div
                className={`space-y-2 rounded-lg transition-colors ${
                  activa ? "bg-brand-soft outline-2 outline-dashed outline-brand" : ""
                }`}
              >
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-faint">
                    {activa ? "Soltar acá" : "Vacío"}
                  </div>
                ) : (
                  items.map((l) => {
                    const proxima = siguiente(l.stage);
                    return (
                      <div
                        key={l.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(l.id));
                          e.dataTransfer.effectAllowed = "move";
                          setArrastrando(l.id);
                        }}
                        onDragEnd={() => {
                          setArrastrando(null);
                          setEncima(null);
                        }}
                        className={`group rounded-lg border border-border bg-surface p-2.5 transition-opacity ${
                          arrastrando === l.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-start gap-1">
                          <span
                            aria-hidden
                            className="mt-0.5 hidden shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100 md:block"
                            title="Arrastrar a otra etapa"
                          >
                            <IconArrastrar size={13} />
                          </span>
                          <Link href={`/crm/${l.id}`} className="tap min-w-0 flex-1 hover:underline">
                            <p className="truncate text-sm font-medium">{l.name}</p>
                          </Link>
                          {proxima && (
                            <button
                              type="button"
                              onClick={() => mover(l.id, proxima, l.stage)}
                              title={`Mover a ${STAGE_LABEL[proxima]}`}
                              className="btn btn-ghost btn-sm shrink-0 px-1.5 text-faint hover:text-brand-ink"
                            >
                              <IconFlecha size={13} />
                              <span className="sr-only">Mover a {STAGE_LABEL[proxima]}</span>
                            </button>
                          )}
                        </div>

                        {l.company && <p className="truncate text-xs text-muted">{l.company}</p>}

                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge tone="neutral">{l.ownerName}</Badge>
                          {l.valueCents > 0 && (
                            <Badge tone="brand">{formatMoney(l.valueCents, l.currency)}</Badge>
                          )}
                        </div>

                        <p
                          className={`mt-1.5 truncate text-xs ${
                            l.missing ? "text-warn" : l.overdue ? "text-risk" : "text-faint"
                          }`}
                        >
                          {l.missing ? "Sin próxima acción" : `${l.nextActionLabel} · ${l.nextAction}`}
                        </p>

                        <div className="mt-2 border-t border-border pt-2">
                          <ContactActions
                            leadId={l.id}
                            nombre={l.name}
                            empresa={l.company}
                            telefono={l.phone}
                            email={l.email}
                            size="sm"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {total > 0 && (
                <p className="tnum mt-2 px-1 text-xs text-faint">
                  Potencial: {formatMoney(total, monedaBase)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
