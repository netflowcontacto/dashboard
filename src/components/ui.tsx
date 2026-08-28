import Link from "next/link";
import type { ReactNode } from "react";
import type { MetricUnit } from "@/lib/metrics/registry";
import { formatMoney } from "@/lib/money";
import type { Currency, Health } from "@/lib/types";
import { Delta, Sparkline, type DeltaValue, type SparkPoint } from "./charts";
import { IconCheck, IconAlertas, IconFlecha } from "./icons";

/* --------------------------------------------------------------------------
   Primitivas de UI compartidas por todo el dashboard.
   -------------------------------------------------------------------------- */

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  padding = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={padding ? "p-4" : ""}>{children}</div>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-muted sm:block">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Encabezado de bloque dentro de una página. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">{children}</h2>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "brand" | "ok" | "warn" | "risk";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-brand-soft text-brand-ink border-transparent",
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
const HEALTH_LABEL: Record<Health, string> = { bien: "Bien", atencion: "Atención", riesgo: "Riesgo" };

/**
 * Semáforo del estado de cuenta. El color va siempre acompañado de icono y
 * texto: nunca es el color solo el que lleva el significado.
 */
export function Semaforo({ health }: { health: Health }) {
  const Icon = health === "bien" ? IconCheck : IconAlertas;
  return (
    <Badge tone={HEALTH_TONE[health]}>
      <Icon size={12} />
      {HEALTH_LABEL[health]}
    </Badge>
  );
}

/**
 * La cifra protagonista de una vista. Una sola por pantalla — si todo es
 * grande, nada es importante.
 */
export function HeroStat({
  label,
  value,
  sub,
  delta,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: DeltaValue;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
        {/* Cifra proporcional a propósito: tabular-nums a este tamaño se ve suelta. */}
        <p className="mt-1 text-5xl font-semibold leading-none tracking-tight">{value}</p>
        {delta && <div className="mt-2"><Delta value={delta} /></div>}
        {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="min-w-56 flex-1">{children}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  delta,
  spark,
  sparkTone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  delta?: DeltaValue;
  spark?: SparkPoint[];
  sparkTone?: "brand" | "ok" | "risk";
}) {
  const toneText =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "risk" ? "text-risk" : "text-text";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        {href && <IconFlecha size={13} className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${toneText}`}>{value}</div>
      {delta && <div className="mt-1"><Delta value={delta} /></div>}
      {hint && <div className="mt-1 text-xs leading-snug text-faint">{hint}</div>}
      {spark && spark.length > 1 && (
        <div className="mt-2.5">
          <Sparkline points={spark} tone={sparkTone} />
        </div>
      )}
    </>
  );

  const className =
    "group block rounded-xl border border-border bg-surface p-4 shadow-card" +
    (href ? " transition-colors hover:bg-surface-2 hover:border-border-strong" : "");

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
 * `pct === null` significa "no hay objetivo cargado". Se muestra explícito,
 * nunca como 0% ni como 100%: el dashboard no inventa números.
 * `expectedPct` dibuja la marca del ritmo esperado según los días del mes.
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
  const height = size === "lg" ? "h-2.5" : size === "sm" ? "h-1.5" : "h-2";

  if (pct === null) {
    return (
      <div>
        <div className={`w-full rounded-full track ${height}`} />
        <p className="mt-1 text-xs text-faint">{emptyLabel}</p>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, pct));
  const behind = expectedPct !== undefined && pct < expectedPct - 5;
  const ahead = expectedPct !== undefined && pct >= expectedPct + 10;
  const color = behind ? "var(--status-critical)" : ahead ? "var(--status-good)" : "var(--series-1)";

  return (
    <div
      className="relative"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progreso hacia el objetivo"
    >
      <div className={`w-full overflow-hidden rounded-full track ${height}`}>
        <div
          className={`${height} rounded-full transition-[width] duration-700`}
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      {expectedPct !== undefined && expectedPct > 0 && expectedPct < 100 && (
        <span
          aria-hidden
          title={`Ritmo esperado: ${Math.round(expectedPct)}%`}
          className="absolute top-0 w-0.5 rounded-full"
          style={{
            left: `calc(${Math.min(100, expectedPct)}% - 1px)`,
            height: "100%",
            background: "var(--text)",
            opacity: 0.35,
          }}
        />
      )}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
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
      {hint && <span className="mt-1 block text-xs leading-snug text-faint">{hint}</span>}
    </label>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-3 flex items-start gap-2 rounded-lg border border-risk-soft bg-risk-soft px-3 py-2 text-sm text-risk"
    >
      <IconAlertas size={15} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="mb-3 flex items-start gap-2 rounded-lg border border-ok-soft bg-ok-soft px-3 py-2 text-sm text-ok"
    >
      <IconCheck size={15} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

/** Nota al pie de una vista: contexto sobre cómo leer los números. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
      {children}
    </p>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden />;
}

/** Placeholder de una pantalla mientras cargan los datos. */
export function PageSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div>
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64 w-full rounded-xl" />
    </div>
  );
}

/* --- formateo de métricas ------------------------------------------------ */

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

/** Números grandes en forma compacta: 1.284 · 12,9 mil · 1,2 M */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(1).replace(".", ",")} mil`;
  return new Intl.NumberFormat("es-AR").format(value);
}
