"use client";

import { useId, useState } from "react";
import { IconAbajo, IconArriba, IconIgual } from "./icons";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/types";

/**
 * Cómo se formatea un valor.
 *
 * Es un objeto y no una función a propósito: estos gráficos son componentes
 * de cliente y las funciones no cruzan la frontera servidor→cliente. Pasar un
 * descriptor serializable mantiene el formateo en un solo lugar.
 */
export type ValueFormat =
  | { kind: "numero" }
  | { kind: "moneda"; currency: Currency }
  | { kind: "porcentaje" };

/** Los importes viajan siempre en centavos. */
export function formatValue(value: number, fmt: ValueFormat): string {
  switch (fmt.kind) {
    case "moneda":
      return formatMoney(Math.round(value), fmt.currency);
    case "porcentaje":
      return `${value.toFixed(0)}%`;
    default:
      return Number.isInteger(value)
        ? new Intl.NumberFormat("es-AR").format(value)
        : value.toFixed(1);
  }
}

/**
 * Gráficos del dashboard.
 *
 * Reglas que se respetan en todos (ver docs/decisiones.md):
 *  - Un solo eje. Nunca dos escalas en el mismo gráfico.
 *  - Marcas finas: columnas de 24px como máximo, extremo redondeado de 4px,
 *    apoyado en la línea base.
 *  - Lo que separa dos marcas es un hueco de 2px del color de la superficie,
 *    nunca un borde dibujado alrededor.
 *  - Leyenda siempre presente con dos o más series; etiquetas directas solo
 *    en el extremo o en el dato que cuenta la historia, nunca en cada punto.
 *  - El texto usa tinta (primary/muted/faint), nunca el color de la serie:
 *    la identidad la da la marca de color al lado.
 *  - Todo gráfico tiene su vista de tabla equivalente.
 */

/* -------------------------------------------------------------------------- */
/* Delta: comparación contra el período anterior                              */
/* -------------------------------------------------------------------------- */

export interface DeltaValue {
  /** Variación relativa en puntos porcentuales. null = no hay base para comparar. */
  pct: number | null;
  /** Si subir es bueno para esta métrica. */
  higherIsBetter: boolean;
  /** Cómo se llama el período contra el que se compara. */
  vs: string;
}

/**
 * El color indica dirección × si subir es bueno, pero nunca va solo:
 * siempre lo acompaña una flecha y el texto del período.
 */
export function Delta({ value, className = "" }: { value: DeltaValue; className?: string }) {
  const { pct, higherIsBetter, vs } = value;

  if (pct === null) {
    return <span className={`text-xs text-faint ${className}`}>sin base de comparación</span>;
  }

  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : pct > 0 === higherIsBetter;
  const Icon = flat ? IconIgual : pct > 0 ? IconArriba : IconAbajo;
  const tone = good === null ? "text-muted" : good ? "text-ok" : "text-risk";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone} ${className}`}>
      <Icon size={13} />
      <span className="tnum">{flat ? "sin cambios" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`}</span>
      <span className="font-normal text-faint">vs {vs}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                   */
/* -------------------------------------------------------------------------- */

export interface SparkPoint {
  label: string;
  value: number;
}

/**
 * Serie corta dentro de una tarjeta. Da la forma de la tendencia; el valor
 * exacto lo dan el número de la tarjeta y el tooltip de cada punto.
 */
export function Sparkline({
  points,
  height = 34,
  tone = "brand",
}: {
  points: SparkPoint[];
  height?: number;
  tone?: "brand" | "ok" | "risk";
}) {
  if (points.length < 2) return null;

  const color = tone === "ok" ? "var(--ok)" : tone === "risk" ? "var(--risk)" : "var(--series-1)";
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 28 - ((v - min) / span) * 26;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  const area = `${line} L100,30 L0,30 Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      style={{ height, width: "100%", display: "block", overflow: "visible" }}
      role="img"
      aria-label={`Tendencia: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`}
    >
      {/* El relleno es un lavado al 10%, nunca un bloque saturado. */}
      <path d={area} fill={color} opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Marcador final: anillo de 2px del color de superficie para que se lea
          aunque cruce la línea. */}
      <circle cx={100} cy={y(last.value)} r={2.6} fill={color} stroke="var(--surface)" strokeWidth={2}
        vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <rect key={p.label} x={x(i) - 4} y={0} width={8} height={30} fill="transparent">
          <title>{`${p.label}: ${p.value}`}</title>
        </rect>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Columnas agrupadas                                                          */
/* -------------------------------------------------------------------------- */

export interface ColumnSeries {
  key: string;
  label: string;
  /** 1 | 2 | 3 — slot de la paleta categórica validada. */
  slot: 1 | 2 | 3;
  values: number[];
}

/**
 * Dos o tres series sobre UN solo eje. Si dos medidas no comparten escala,
 * no van en el mismo gráfico: van en dos gráficos o indexadas a una base.
 */
export function ColumnsChart({
  labels,
  series,
  format,
  height = 160,
  caption,
}: {
  labels: string[];
  series: ColumnSeries[];
  format: ValueFormat;
  height?: number;
  caption?: string;
}) {
  const fmt = (v: number) => formatValue(v, format);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const colorOf = (slot: 1 | 2 | 3) => `var(--series-${slot})`;

  return (
    <figure className="m-0">
      {/* Leyenda: con dos o más series es obligatoria. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-3">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-sm"
                style={{ background: colorOf(s.slot) }}
              />
              {s.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-faint"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
        >
          {showTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {showTable ? (
        <div className="scroll-x" id={tableId}>
          <table className="nf">
            <thead>
              <tr>
                <th>Período</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l}>
                  <td>{l}</td>
                  {series.map((s) => (
                    <td key={s.key} className="tnum text-right">{fmt(s.values[i] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-end gap-1" style={{ height }} role="presentation">
            {labels.map((label, i) => (
              <div
                key={label}
                className="relative flex h-full flex-1 cursor-default items-end justify-center gap-[2px] rounded-t transition-colors"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                style={{ background: hover === i ? "var(--surface-2)" : "transparent" }}
                aria-label={`${label}: ${series.map((s) => `${s.label} ${fmt(s.values[i] ?? 0)}`).join(", ")}`}
              >
                {series.map((s) => {
                  const v = s.values[i] ?? 0;
                  const h = Math.max(v > 0 ? 3 : 0, (v / max) * (height - 8));
                  return (
                    <div
                      key={s.key}
                      style={{
                        height: h,
                        width: `min(24px, ${Math.max(6, 60 / series.length)}%)`,
                        background: colorOf(s.slot),
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                  );
                })}

                {hover === i && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-pop"
                  >
                    <p className="mb-1 text-xs font-medium">{label}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
                        <span
                          aria-hidden
                          className="inline-block size-2 rounded-sm"
                          style={{ background: colorOf(s.slot) }}
                        />
                        {s.label}
                        <span className="tnum ml-auto pl-3 font-medium text-text">
                          {fmt(s.values[i] ?? 0)}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Línea base: hairline sólida, un paso por encima de la superficie. */}
          <div className="h-px w-full" style={{ background: "var(--axis)" }} />
          <div className="mt-1.5 flex gap-1">
            {labels.map((l) => (
              <span key={l} className="tnum flex-1 text-center text-[0.68rem] text-faint">
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
      {caption && <figcaption className="mt-2 text-xs text-faint">{caption}</figcaption>}
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Lista de barras (una sola serie)                                            */
/* -------------------------------------------------------------------------- */

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Marca esta fila como estado crítico (color de estado, no de serie). */
  critical?: boolean;
  hint?: string;
}

/**
 * Categorías nominales: UNA serie, UN color. Nunca una rampa por magnitud —
 * eso duplicaría en color lo que la longitud de la barra ya dice.
 */
export function BarList({
  rows,
  format,
  max: maxOverride,
}: {
  rows: BarRow[];
  format: ValueFormat;
  max?: number;
}) {
  const fmt = (v: number) => formatValue(v, format);
  const max = maxOverride ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100);
        return (
          <li key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{r.label}</span>
              <span className="tnum shrink-0 text-sm font-medium">
                {fmt(r.value)}
                {r.hint && <span className="ml-1.5 text-xs font-normal text-faint">{r.hint}</span>}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full track">
              <div
                className="h-2 rounded-full transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  background: r.critical ? "var(--status-critical)" : "var(--series-1)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Funnel                                                                      */
/* -------------------------------------------------------------------------- */

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  stepRate: number | null;
  totalRate: number | null;
  isBottleneck: boolean;
}

/**
 * Embudo. Un solo color para toda la cadena: la longitud ya codifica la
 * magnitud. El único color distinto es el rojo de estado sobre el cuello de
 * botella — que es justo la historia que la pantalla tiene que contar.
 */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <figure className="m-0">
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          className="btn btn-ghost btn-sm text-faint"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
        >
          {showTable ? "Ver embudo" : "Ver tabla"}
        </button>
      </div>

      {showTable ? (
        <div className="scroll-x" id={tableId}>
          <table className="nf">
            <thead>
              <tr>
                <th>Etapa</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Del paso anterior</th>
                <th className="text-right">Del total de leads</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td className="tnum text-right">{s.value}</td>
                  <td className="tnum text-right">{s.stepRate === null ? "—" : `${s.stepRate.toFixed(0)}%`}</td>
                  <td className="tnum text-right">{s.totalRate === null ? "—" : `${s.totalRate.toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="space-y-2.5">
          {stages.map((s) => {
            const width = Math.max(s.value > 0 ? 2 : 0, (s.value / max) * 100);
            return (
              <li key={s.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted">
                    <span className="tnum font-medium text-text">{s.value}</span>
                    {s.stepRate !== null && (
                      <span className={s.isBottleneck ? "ml-2 font-semibold text-risk" : "ml-2 text-faint"}>
                        {s.stepRate.toFixed(0)}% del paso anterior
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-7 w-full overflow-hidden rounded-md track">
                  <div
                    className="flex h-7 items-center rounded-md px-2 transition-[width] duration-500"
                    style={{
                      width: `${width}%`,
                      background: s.isBottleneck ? "var(--status-critical)" : "var(--series-1)",
                    }}
                  >
                    {/* La etiqueta va dentro solo si entra con aire; si no, se
                        cae al tooltip y a la vista de tabla. */}
                    {s.totalRate !== null && width > 22 && (
                      <span className="tnum text-xs font-medium text-white">
                        {s.totalRate.toFixed(0)}% del total
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </figure>
  );
}
