import Link from "next/link";
import type { ReactNode } from "react";
import type { MetricUnit } from "@/lib/metrics/registry";
import { formatMoney } from "@/lib/money";
import type { Currency, Health } from "@/lib/types";

/* --------------------------------------------------------------------------
   Primitivas de UI compartidas por todo el dashboard.
   -------------------------------------------------------------------------- */

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export type Tone = "neutral" | "brand" | "ok" | "warn" | "risk";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  risk: "bg-risk-soft text-risk border-transparent",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

const HEALTH_TONE: Record<Health, Tone> = { bien: "ok", atencion: "warn", riesgo: "risk" };
const HEALTH_LABEL: Record<Health, string> = { bien: "Bien", atencion: "Atencion", riesgo: "Riesgo" };

/** Semaforo de estado de cuenta. */
export function Semaforo({ health }: { health: Health }) {
  return (
    <Badge tone={HEALTH_TONE[health]}>
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ background: "currentColor" }}
      />
      {HEALTH_LABEL[health]}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const toneText =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "risk" ? "text-risk" : "text-text";

  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${toneText}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );

  const className =
    "rounded-xl border border-border bg-surface p-4 block" + (href ? " hover:bg-surface-2 transition-colors" : "");

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Barra de progreso objetivo vs resultado.
 *
 * `pct === null` significa "no hay objetivo cargado". Se muestra explicito,
 * nunca como 0% ni como 100%: el dashboard no inventa numeros.
 * `expectedPct` dibuja la marca del ritmo esperado segun los dias del mes.
 */
export function ProgressBar({
  pct,
  expectedPct,
  size = "md",
  emptyLabel = "Sin objetivo cargado",
}: {
  pct: number | null;
  expectedPct?: number;
  size?: "sm" | "md" | "lg";
  emptyLabel?: string;
}) {
  const height = size === "lg" ? "h-3" : size === "sm" ? "h-1.5" : "h-2";

  if (pct === null) {
    return (
      <div>
        <div className={`w-full rounded-full bg-surface-2 ${height}`} />
        <p className="mt-1 text-xs text-faint">{emptyLabel}</p>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, pct));
  const behind = expectedPct !== undefined && pct < expectedPct - 5;
  const ahead = expectedPct !== undefined && pct >= expectedPct + 10;
  const color = behind ? "var(--risk)" : ahead ? "var(--ok)" : "var(--brand)";

  return (
    <div
      className="relative"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progreso hacia el objetivo"
    >
      <div className={`w-full overflow-hidden rounded-full bg-surface-2 ${height}`}>
        <div
          className={`${height} rounded-full transition-[width] duration-500`}
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      {expectedPct !== undefined && expectedPct > 0 && expectedPct < 100 && (
        <span
          aria-hidden
          title={`Ritmo esperado: ${Math.round(expectedPct)}%`}
          className="absolute top-0 w-px bg-faint"
          style={{ left: `${Math.min(100, expectedPct)}%`, height: "100%" }}
        />
      )}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-md text-xs text-muted">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {required && <span className="ml-0.5 text-risk">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-3 rounded-lg border border-risk-soft bg-risk-soft px-3 py-2 text-sm text-risk">{message}</p>
  );
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-3 rounded-lg border border-ok-soft bg-ok-soft px-3 py-2 text-sm text-ok">{message}</p>
  );
}

/* --- formateo de metricas ------------------------------------------------ */

export function formatMetric(value: number | null, unit: MetricUnit, currency: Currency = "USD"): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (unit) {
    case "porcentaje":
      return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
    case "moneda":
      return formatMoney(Math.round(value * 100), currency);
    case "horas":
      return value < 1 ? `${Math.round(value * 60)} min` : `${value.toFixed(1)} h`;
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

export function formatPct(value: number | null, digits = 0): string {
  return value === null || Number.isNaN(value) ? "—" : `${value.toFixed(digits)}%`;
}
