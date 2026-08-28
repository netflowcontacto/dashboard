import "server-only";
import { all, one } from "../db";
import { toBase, type Fx } from "../fx";
import type { DateRange } from "../dates";
import { CALIDADES_CALIFICADAS } from "../adquisicion";

/**
 * Métricas del funnel de adquisición de cada cliente.
 *
 * Están separadas del registro general por una razón concreta: el registro
 * mide a NetFlow (una empresa), y esto mide a cada cliente (muchos). Meterlas
 * en el mismo lugar terminaría promediando el CPL de la agencia con el de las
 * cuentas, que es un número que no significa nada.
 *
 * Dos reglas que valen para todo el archivo:
 *
 *  1. El gasto NUNCA se lee de `ad_insights_daily` directo, sino de la vista
 *     `ad_insights_effective`, que para cada campaña y día se queda con el
 *     nivel más fino cargado. Sumar la fila de campaña y las de sus anuncios
 *     contaría el gasto dos veces.
 *  2. Los leads, calificados, turnos y cierres salen del CRM, no de lo que
 *     reporta la plataforma. `platform_leads` se guarda como referencia; la
 *     verdad de abajo del embudo es nuestra.
 */

/** Meses (fraccionarios) que abarca un rango, mínimo uno. */
function mesesEnRango(range: DateRange): number {
  const dias =
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.max(1, dias / 30.4375);
}

export interface Embudo {
  leads: number;
  contactados: number;
  calificados: number;
  agendados: number;
  asistieron: number;
  cerrados: number;
}

export interface CostosAdquisicion {
  /** Todo en unidades de la moneda base, no en centavos. */
  inversion: number;
  cpl: number | null;
  cpql: number | null;
  costoPorTurno: number | null;
  costoPorAsistencia: number | null;
  cac: number | null;
  ingresos: number;
  /**
   * ROAS: ingresos / inversión. Cuántas veces vuelve cada peso de pauta.
   * Se calcula sobre los cierres del CRM, no sobre lo que reporta Meta.
   */
  roas: number | null;
  /**
   * ROI sobre la pauta: (ingresos - inversión) / inversión.
   *
   * Es la ganancia, no el múltiplo. ROAS 1 y ROI 0% son el mismo punto —el de
   * empatar—, y decirlo de las dos formas evita la confusión más común:
   * "ROAS 1,2" suena a que va bien y es 20% de retorno antes de cualquier
   * costo. No incluye el fee de NetFlow, así que lo ve todo el equipo.
   */
  roiPauta: number | null;
  /**
   * ROI total del cliente: (ingresos - (inversión + fee)) / (inversión + fee).
   *
   * Es la pregunta que el cliente le hace a NetFlow: "¿me conviene?". Incluye
   * el fee, que es información de facturación, así que solo llega a Dirección
   * — por eso viaja aparte y no dentro del bloque que ve todo el equipo.
   */
  roiCliente: number | null;
  /** Fee mensual del cliente en moneda base. Solo Dirección. */
  feeMensual: number | null;
}

export interface Conversiones {
  contacto: number | null;
  calificacion: number | null;
  agenda: number | null;
  asistencia: number | null;
  cierre: number | null;
}

export interface ResumenAdquisicion {
  embudo: Embudo;
  costos: CostosAdquisicion;
  conversiones: Conversiones;
  /** Sin gasto cargado no se puede hablar de costos: la interfaz tiene que decirlo. */
  tieneInversion: boolean;
}

function pct(numerador: number, denominador: number): number | null {
  return denominador > 0 ? (numerador / denominador) * 100 : null;
}

function porUnidad(total: number, cantidad: number): number | null {
  return cantidad > 0 ? total / cantidad : null;
}

/**
 * Retorno sobre una inversión, en porcentaje.
 *
 * 0% es empatar, 100% es haber ganado lo mismo que se puso, -100% es haberlo
 * perdido todo. Devuelve null cuando no hubo inversión: sin costo no hay
 * retorno que calcular, y un "infinito" en una tarjeta no ayuda a nadie.
 */
function roi(ingresos: number, costo: number): number | null {
  return costo > 0 ? ((ingresos - costo) / costo) * 100 : null;
}

/**
 * Inversión del cliente en el rango, en unidades de la moneda base.
 *
 * `filtro` permite acotar a una campaña o a un anuncio sin duplicar la
 * consulta; es lo que hace posible el drill down de KPI a creatividad.
 */
export async function inversionDe(
  clientId: number,
  range: DateRange,
  fx: Fx,
  filtro: { campaignId?: number; adId?: number } = {},
): Promise<number> {
  const cond: string[] = ["client_id = ?", "date BETWEEN ? AND ?"];
  const params: unknown[] = [clientId, range.from, range.to];

  if (filtro.campaignId) {
    cond.push("campaign_id = ?");
    params.push(filtro.campaignId);
  }
  if (filtro.adId) {
    cond.push("ad_id = ?");
    params.push(filtro.adId);
  }

  const filas = await all<{ spend_cents: number; currency: "ARS" | "USD" }>(
    `SELECT spend_cents, currency FROM ad_insights_effective WHERE ${cond.join(" AND ")}`,
    params,
  );
  return filas.reduce((acc, f) => acc + toBase(f.spend_cents, f.currency, fx), 0) / 100;
}

/**
 * El embudo de pacientes por cohorte: cuenta hasta dónde llegaron los que
 * ENTRARON en el rango, no lo que pasó en el rango.
 *
 * Es la misma decisión que ya tomó el funnel comercial y por el mismo motivo:
 * medir por actividad hace que un paso pueda tener más gente que el anterior
 * y que las conversiones pasen del 100%.
 */
export async function embudoDe(
  clientId: number,
  range: DateRange,
  filtro: { campaignId?: number; adId?: number } = {},
): Promise<Embudo> {
  const cond: string[] = ["client_id = ?", "entered_at BETWEEN ? AND ?"];
  const params: unknown[] = [clientId, range.from, range.to];

  if (filtro.campaignId) {
    cond.push("campaign_id = ?");
    params.push(filtro.campaignId);
  }
  if (filtro.adId) {
    cond.push("ad_id = ?");
    params.push(filtro.adId);
  }
  const where = cond.join(" AND ");

  const fila = await one<Record<keyof Embudo, number>>(
    `SELECT
       COUNT(*)                                                   AS leads,
       COUNT(first_contacted_at)                                  AS contactados,
       COUNT(*) FILTER (WHERE quality = ANY(?))                   AS calificados,
       COUNT(booked_at)                                           AS agendados,
       COUNT(showed_at)                                           AS asistieron,
       COUNT(*) FILTER (WHERE outcome = 'won')                    AS cerrados
     FROM client_leads WHERE ${where}`,
    [CALIDADES_CALIFICADAS, ...params],
  );

  return {
    leads: Number(fila?.leads ?? 0),
    contactados: Number(fila?.contactados ?? 0),
    calificados: Number(fila?.calificados ?? 0),
    agendados: Number(fila?.agendados ?? 0),
    asistieron: Number(fila?.asistieron ?? 0),
    cerrados: Number(fila?.cerrados ?? 0),
  };
}

/** Ingresos declarados en los cierres del rango, en moneda base. */
export async function ingresosDe(
  clientId: number,
  range: DateRange,
  fx: Fx,
  filtro: { campaignId?: number; adId?: number } = {},
): Promise<number> {
  const cond: string[] = ["client_id = ?", "outcome = 'won'", "entered_at BETWEEN ? AND ?"];
  const params: unknown[] = [clientId, range.from, range.to];

  if (filtro.campaignId) {
    cond.push("campaign_id = ?");
    params.push(filtro.campaignId);
  }
  if (filtro.adId) {
    cond.push("ad_id = ?");
    params.push(filtro.adId);
  }

  const filas = await all<{ value_cents: number; currency: "ARS" | "USD" }>(
    `SELECT value_cents, currency FROM client_leads WHERE ${cond.join(" AND ")}`,
    params,
  );
  return filas.reduce((acc, f) => acc + toBase(f.value_cents, f.currency, fx), 0) / 100;
}

/**
 * Fee mensual del cliente en moneda base.
 *
 * Es dato de facturación: quien llame a esto tiene que haber verificado
 * `clientes:ver_fees` antes. El resumen lo devuelve en su propio campo y la
 * ficha lo omite para el equipo.
 */
export async function feeMensualDe(clientId: number, fx: Fx): Promise<number | null> {
  const c = await one<{ fee_cents: number; fee_currency: "ARS" | "USD" }>(
    "SELECT fee_cents, fee_currency FROM clients WHERE id = ?",
    [clientId],
  );
  if (!c || c.fee_cents <= 0) return null;
  return toBase(c.fee_cents, c.fee_currency, fx) / 100;
}

/** Todo junto: es lo que consume la ficha del cliente y el drill down. */
export async function resumenAdquisicion(
  clientId: number,
  range: DateRange,
  fx: Fx,
  filtro: { campaignId?: number; adId?: number } = {},
  /**
   * Solo Dirección. Cuando es false —el caso del equipo— el fee no se
   * consulta siquiera, y el ROI total del cliente vuelve en null. Filtrar en
   * el motor y no en la vista es lo que evita que el número se escape por una
   * pantalla nueva que nadie revisó.
   */
  incluirFacturacion = false,
): Promise<ResumenAdquisicion> {
  const [inversion, embudo, ingresos, feeMensual] = await Promise.all([
    inversionDe(clientId, range, fx, filtro),
    embudoDe(clientId, range, filtro),
    ingresosDe(clientId, range, fx, filtro),
    incluirFacturacion ? feeMensualDe(clientId, fx) : Promise.resolve(null),
  ]);

  // El fee es mensual; la inversión, del rango pedido. Prorratear el fee por
  // los meses que abarca el rango evita comparar un trimestre de pauta contra
  // un mes de honorarios.
  const meses = mesesEnRango(range);
  const feeDelRango = feeMensual === null ? null : feeMensual * meses;
  const costoTotal = feeDelRango === null ? null : inversion + feeDelRango;

  return {
    embudo,
    tieneInversion: inversion > 0,
    costos: {
      inversion,
      cpl: porUnidad(inversion, embudo.leads),
      cpql: porUnidad(inversion, embudo.calificados),
      costoPorTurno: porUnidad(inversion, embudo.agendados),
      costoPorAsistencia: porUnidad(inversion, embudo.asistieron),
      cac: porUnidad(inversion, embudo.cerrados),
      ingresos,
      roas: inversion > 0 ? ingresos / inversion : null,
      roiPauta: roi(ingresos, inversion),
      roiCliente: costoTotal === null ? null : roi(ingresos, costoTotal),
      feeMensual,
    },
    conversiones: {
      contacto: pct(embudo.contactados, embudo.leads),
      calificacion: pct(embudo.calificados, embudo.leads),
      agenda: pct(embudo.agendados, embudo.calificados),
      asistencia: pct(embudo.asistieron, embudo.agendados),
      cierre: pct(embudo.cerrados, embudo.asistieron),
    },
  };
}
