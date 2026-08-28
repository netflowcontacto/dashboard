"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { IconCerrar, IconCheck, IconAlertas } from "./icons";

/**
 * Avisos breves con opción de deshacer.
 *
 * Es la contraparte obligatoria de cualquier acción optimista: si la pantalla
 * se actualiza antes de que el servidor confirme, la persona necesita ver que
 * pasó algo y poder revertirlo. Sin el "deshacer", mover una tarjeta por error
 * da miedo, y el miedo hace que el tablero se deje de usar.
 */

export interface ToastOptions {
  message: string;
  tone?: "ok" | "error";
  /** Si viene, se muestra "Deshacer" durante unos segundos. */
  onUndo?: () => void;
  durationMs?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "onUndo">> {
  id: number;
  onUndo?: () => void;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => [
      ...list,
      {
        id,
        message: options.message,
        tone: options.tone ?? "ok",
        // Con "deshacer" el aviso dura más: cinco segundos es lo que se
        // tarda en darse cuenta de que uno se equivocó.
        durationMs: options.durationMs ?? (options.onUndo ? 6000 : 3500),
        onUndo: options.onUndo,
      },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, item.durationMs);
    return () => clearTimeout(timer);
  }, [item.durationMs, onDismiss]);

  const Icon = item.tone === "error" ? IconAlertas : IconCheck;

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-pop"
    >
      <span className={item.tone === "error" ? "text-risk" : "text-ok"}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1 text-sm">{item.message}</span>
      {item.onUndo && (
        <button
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() => {
            item.onUndo?.();
            onDismiss();
          }}
        >
          Deshacer
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="btn btn-ghost btn-sm shrink-0 px-1 text-faint"
        aria-label="Cerrar aviso"
      >
        <IconCerrar size={13} />
      </button>
    </div>
  );
}
