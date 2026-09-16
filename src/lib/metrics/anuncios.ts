import "server-only";
import { all } from "../db";
import { toBase, type Fx } from "../fx";
import type { DateRange } from "../dates";
import { CALIDADES_CALIFICADAS, type ClaseCreatividad } from "../adquisicion";

/**
 * Rendimiento por anuncio y por campaña.
 *
 * El gasto y la entrega salen de la plataforma; los leads, los calificados,
 * los turnos y los cierres salen del CRM. Esa es toda la gracia: el CPL lo
 * sabe Meta, pero el CPQL y el costo por turno solo los puede saber este
 * sistema, porque la calificación y el turno pasan acá adentro.
 *
 * El gasto se lee de `ad_insights_effective` —la vista que se queda con el
 * nivel más fino cargado— y nunca de la tabla cruda: si alguien cargó a nivel
 * campaña y después entró la API con filas por anuncio, sumar las dos cosas
 * contaría el gasto dos veces.
 */

export type Nivel = "campaña" | "anuncio";

export interface FilaAnuncio {
  id: number;
  nombre: string;
  /** Nombre de la campaña. Vacío cuando la fila ya es una campaña. */
  campana: string;
  estado: string;
  clienteId: number;
  cliente: string;

  inversion: number;
  impresiones: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;

  leads: number;
  calificados: number;
  turnos: number;
  asistieron: number;
  cerrados: number;
  ingresos: number;

  cpl: number | null;
  cpql: number | null;
  costoPorTurno: number | null;
  cac: number | null;
  roas: number | null;
  /** Qué proporción de los leads califica. Es lo que separa volumen de calidad. */
  tasaCalificacion: number | null;

  clase: ClaseCreatividad;
  /** Por qué quedó en esa clase, en castellano. */
  porQue: string;
}

const porUnidad = (t: number, c: number) => (c > 0 ? t / c : null);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

/** Mediana, que a diferencia del promedio no se va al diablo con un caso raro. */
function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Clasifica un anuncio por la calidad del resultado, no por el CTR.
 *
 * Un anuncio con mucho clic y ningún calificado es peor que uno con la mitad
 * de clics y el triple de turnos: lo que se compra son pacientes, no clics.
 * La comparación es contra los demás anuncios DEL MISMO cliente —un CPQL de
 * US$ 40 puede ser excelente en una especialidad y pésimo en otra— y se hace
 * sobre la mediana, para que un anuncio raro no mueva la vara de todos.
 */
function clasificar(
  f: Pick<FilaAnuncio, "leads" | "calificados" | "cpql" | "inversion" | "roas">,
  cpqlMediana: number | null,
  minimoLeads: number,
): { clase: ClaseCreatividad; porQue: string } {
  if (f.inversion <= 0) {
    return { clase: "sin_datos", porQue: "Todavía no tiene gasto cargado en el período." };
  }
  if (f.leads < minimoLeads) {
    return {
      clase: "sin_datos",
      porQue: `Lleva ${f.leads} ${f.leads === 1 ? "lead" : "leads"}: con menos de ${minimoLeads} cualquier conclusión es ruido.`,
    };
  }
  if (f.calificados === 0) {
    return {
      clase: "flojo",
      porQue: `Trajo ${f.leads} leads y ninguno calificó. Es volumen que no sirve.`,
    };
  }
  if (f.cpql === null || cpqlMediana === null) {
    return { clase: "probando", porQue: "Hay leads calificados pero falta con qué comparar." };
  }

  const r = f.cpql / cpqlMediana;
  const comparado =
    r <= 1
      ? `${Math.round((1 - r) * 100)}% más barato que la mediana del cliente`
      : `${Math.round((r - 1) * 100)}% más caro que la mediana del cliente`;

  if (r <= 0.7 && f.calificados >= 3) {
    return { clase: "ganadora", porQue: `Su costo por calificado es ${comparado}. Para escalar.` };
  }
  if (r <= 1) return { clase: "escalando", porQue: `Su costo por calificado es ${comparado}.` };
  if (r <= 1.5) return { clase: "probando", porQue: `Su costo por calificado es ${comparado}.` };
  return { clase: "flojo", porQue: `Su costo por calificado es ${comparado}. Conviene revisarlo.` };
}

interface Opciones {
  clientId?: number;
  nivel?: Nivel;
  /** Debajo de esta cantidad de leads no se clasifica: sería adivinar. */
  minimoLeads?: number;
}

export async function rendimientoDeAnuncios(
  range: DateRange,
  fx: Fx,
  { clientId, nivel = "anuncio", minimoLeads = 10 }: Opciones = {},
): Promise<FilaAnuncio[]> {
  const porAnuncio = nivel === "anuncio";
  const clave = porAnuncio ? "ad_id" : "campaign_id";

  const filtroCliente = clientId ? " AND client_id = ?" : "";
  const paramCliente = clientId ? [clientId] : [];

  // El gasto se agrupa por moneda para poder convertir después: sumar centavos
  // de monedas distintas en SQL daría un número sin significado.
  const gasto = await all<{
    id: number | null;
    currency: "ARS" | "USD";
    cents: number;
    impresiones: number;
    clicks: number;
  }>(
    `SELECT ${clave} AS id, currency,
            SUM(spend_cents)  AS cents,
            SUM(impressions)  AS impresiones,
            SUM(clicks)       AS clicks
       FROM ad_insights_effective
      WHERE date BETWEEN ? AND ?${filtroCliente}
      GROUP BY ${clave}, currency`,
    [range.from, range.to, ...paramCliente],
  );

  const leads = await all<{
    id: number | null;
    leads: number;
    calificados: number;
    turnos: number;
    asistieron: number;
    cerrados: number;
    valor_ars: number;
    valor_usd: number;
  }>(
    `SELECT ${clave} AS id,
            COUNT(*)                                            AS leads,
            COUNT(*) FILTER (WHERE quality = ANY(?))            AS calificados,
            COUNT(booked_at)                                    AS turnos,
            COUNT(showed_at)                                    AS asistieron,
            COUNT(*) FILTER (WHERE outcome = 'won')             AS cerrados,
            COALESCE(SUM(value_cents) FILTER (WHERE outcome = 'won' AND currency = 'ARS'), 0) AS valor_ars,
            COALESCE(SUM(value_cents) FILTER (WHERE outcome = 'won' AND currency = 'USD'), 0) AS valor_usd
       FROM client_leads
      WHERE entered_at BETWEEN ? AND ?${filtroCliente}
      GROUP BY ${clave}`,
    [CALIDADES_CALIFICADAS, range.from, range.to, ...paramCliente],
  );

  const nombres = porAnuncio
    ? await all<{ id: number; nombre: string; campana: string; estado: string; client_id: number; cliente: string }>(
        `SELECT a.id, a.name AS nombre, c.name AS campana, a.status AS estado,
                a.client_id, cl.name AS cliente
           FROM ads a
           JOIN ad_sets s  ON s.id = a.ad_set_id
           JOIN campaigns c ON c.id = s.campaign_id
           JOIN clients cl  ON cl.id = a.client_id`,
      )
    : await all<{ id: number; nombre: string; campana: string; estado: string; client_id: number; cliente: string }>(
        `SELECT c.id, c.name AS nombre, '' AS campana, c.status AS estado,
                c.client_id, cl.name AS cliente
           FROM campaigns c JOIN clients cl ON cl.id = c.client_id`,
      );

  const gastoPorId = new Map<number, { inversion: number; impresiones: number; clicks: number }>();
  for (const g of gasto) {
    if (g.id === null) continue;
    const acc = gastoPorId.get(g.id) ?? { inversion: 0, impresiones: 0, clicks: 0 };
    acc.inversion += toBase(Number(g.cents), g.currency, fx) / 100;
    acc.impresiones += Number(g.impresiones);
    acc.clicks += Number(g.clicks);
    gastoPorId.set(g.id, acc);
  }

  const leadsPorId = new Map(leads.filter((l) => l.id !== null).map((l) => [l.id as number, l]));

  const filas: FilaAnuncio[] = nombres.map((n) => {
    const g = gastoPorId.get(n.id) ?? { inversion: 0, impresiones: 0, clicks: 0 };
    const l = leadsPorId.get(n.id);

    const cantidad = {
      leads: Number(l?.leads ?? 0),
      calificados: Number(l?.calificados ?? 0),
      turnos: Number(l?.turnos ?? 0),
      asistieron: Number(l?.asistieron ?? 0),
      cerrados: Number(l?.cerrados ?? 0),
    };
    const ingresos =
      (toBase(Number(l?.valor_ars ?? 0), "ARS", fx) + toBase(Number(l?.valor_usd ?? 0), "USD", fx)) / 100;

    return {
      id: n.id,
      nombre: n.nombre,
      campana: n.campana,
      estado: n.estado,
      clienteId: n.client_id,
      cliente: n.cliente,
      inversion: g.inversion,
      impresiones: g.impresiones,
      clicks: g.clicks,
      ctr: pct(g.clicks, g.impresiones),
      cpm: g.impresiones > 0 ? (g.inversion / g.impresiones) * 1000 : null,
      ...cantidad,
      ingresos,
      cpl: porUnidad(g.inversion, cantidad.leads),
      cpql: porUnidad(g.inversion, cantidad.calificados),
      costoPorTurno: porUnidad(g.inversion, cantidad.turnos),
      cac: porUnidad(g.inversion, cantidad.cerrados),
      roas: g.inversion > 0 && ingresos > 0 ? ingresos / g.inversion : null,
      tasaCalificacion: pct(cantidad.calificados, cantidad.leads),
      clase: "sin_datos" as ClaseCreatividad,
      porQue: "",
    };
  });

  // La vara se calcula por cliente: comparar el CPQL de una odontología contra
  // el de una dermatología no dice nada.
  const porCliente = new Map<number, number[]>();
  for (const f of filas) {
    if (f.cpql !== null && f.leads >= minimoLeads) {
      porCliente.set(f.clienteId, [...(porCliente.get(f.clienteId) ?? []), f.cpql]);
    }
  }

  for (const f of filas) {
    const { clase, porQue } = clasificar(f, mediana(porCliente.get(f.clienteId) ?? []), minimoLeads);
    f.clase = clase;
    f.porQue = porQue;
  }

  return filas.sort((a, b) => b.inversion - a.inversion);
}
