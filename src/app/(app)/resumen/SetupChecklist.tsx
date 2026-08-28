import Link from "next/link";
import { Card } from "@/components/ui";
import { IconCheck, IconFlecha } from "@/components/icons";
import type { SetupStatus } from "@/lib/setup";

/** Guía de puesta en marcha. Se oculta sola cuando ya no queda nada por hacer. */
export default function SetupChecklist({ status }: { status: SetupStatus }) {
  if (status.pending === 0) return null;

  const done = status.steps.length - status.pending;

  return (
    <Card
      className="mb-5"
      title="Puesta en marcha"
      subtitle={`${done} de ${status.steps.length} pasos listos. Los números aparecen a medida que se carga cada cosa.`}
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {status.steps.map((step) => (
          <li key={step.key}>
            {step.done ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-ok">
                  <IconCheck size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-muted line-through">{step.label}</span>
                </span>
              </div>
            ) : (
              <Link
                href={step.href}
                className="group flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span
                  aria-hidden
                  className="mt-1 size-3.5 shrink-0 rounded-full border-2 border-border-strong"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{step.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{step.detail}</span>
                </span>
                <IconFlecha
                  size={14}
                  className="mt-0.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
