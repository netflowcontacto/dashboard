/**
 * Puertos de plataforma publicitaria.
 *
 * La regla de esta carpeta es una sola: **ningún adaptador inventa datos**.
 * Si no hay API conectada, `estado()` lo dice y la pantalla muestra "Sin
 * conectar" con el botón para conectarla — nunca un número de relleno.
 *
 * Hay tres implementaciones y dos de ellas funcionan hoy sin credenciales:
 *
 *   manual  — Paid Media carga el gasto por campaña y día. Es el camino real
 *             de NetFlow hoy.
 *   csv     — sube el export de Ads Manager. Mismo destino, cero API.
 *   meta    — declarado con su forma final, desconectado hasta que haya token.
 *
 * Todos escriben en `ad_insights_daily` con su `source`, así que en la
 * interfaz siempre se puede decir de dónde salió cada número.
 */
import type { OrigenDato, Plataforma } from "../adquisicion";

/** Una fila de gasto y entrega, ya normalizada, lista para guardar. */
export interface FilaInsight {
  /** Identificador de la campaña en la plataforma. Vacío si la carga es manual. */
  campaignExternalId: string;
  campaignName: string;
  adSetExternalId?: string;
  adSetName?: string;
  adExternalId?: string;
  adName?: string;
  /** 'YYYY-MM-DD' */
  date: string;
  spendCents: number;
  currency: "ARS" | "USD";
  impressions: number;
  reach: number;
  clicks: number;
  /** Leads que reporta la plataforma. Referencia, no verdad: la verdad es el CRM. */
  platformLeads: number;
}

export type EstadoConexion =
  | { conectada: false; motivo: string }
  | { conectada: true; ultimaSync: string | null };

export interface AdaptadorPlataforma {
  readonly plataforma: Plataforma;
  readonly origen: OrigenDato;
  readonly nombre: string;
  /**
   * Si la fuente necesita configuración para funcionar. Los adaptadores
   * manuales y de CSV no: por eso sirven desde el primer día.
   */
  readonly necesitaCredenciales: boolean;

  estado(clientId: number): Promise<EstadoConexion>;

  /**
   * Trae el gasto y la entrega del rango. Los adaptadores que no pueden
   * traerlos solos (manual, CSV) tiran un error explicando por dónde entra el
   * dato: nunca devuelven una lista vacía haciéndose los que sincronizaron.
   */
  traer(clientId: number, desde: string, hasta: string): Promise<FilaInsight[]>;
}

/** Error que dice qué falta para que una fuente funcione. */
export class FuenteNoConectada extends Error {
  constructor(
    public readonly plataforma: Plataforma,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "FuenteNoConectada";
  }
}
