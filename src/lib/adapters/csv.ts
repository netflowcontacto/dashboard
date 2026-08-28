import "server-only";
import { one } from "../db";
import { parseAmountToCents } from "../money";
import { FuenteNoConectada, type AdaptadorPlataforma, type FilaInsight } from "./tipos";

/**
 * Importación del CSV que exporta Meta Ads Manager.
 *
 * Es la fuente que más valor da hoy: no necesita credenciales, ni permisos de
 * la cuenta del cliente, ni esperar a que alguien apruebe una app. Se baja el
 * informe con desglose por día y se sube.
 *
 * El parseo es tolerante a propósito. Ads Manager exporta los encabezados en
 * el idioma de la cuenta y cambia los nombres cada tanto, así que cada campo
 * se busca por varios alias en vez de por una posición fija: si mañana Meta
 * renombra una columna, se agrega un alias y no se rompe la importación.
 */

const ALIAS: Record<string, string[]> = {
  campaignName: ["campaign name", "nombre de la campaña", "nombre de la campana", "campaña"],
  campaignId: ["campaign id", "identificador de la campaña", "id de la campaña"],
  adSetName: ["ad set name", "nombre del conjunto de anuncios", "conjunto de anuncios"],
  adSetId: ["ad set id", "identificador del conjunto de anuncios"],
  adName: ["ad name", "nombre del anuncio", "anuncio"],
  adId: ["ad id", "identificador del anuncio"],
  date: ["day", "date", "día", "dia", "fecha", "reporting starts", "inicio del informe"],
  spend: ["amount spent", "amount spent (usd)", "importe gastado", "importe gastado (ars)", "gasto", "spend"],
  impressions: ["impressions", "impresiones"],
  reach: ["reach", "alcance"],
  clicks: ["link clicks", "clicks (all)", "clics en el enlace", "clics (todos)", "clics"],
  leads: ["leads", "results", "resultados", "clientes potenciales"],
};

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Parte una línea de CSV respetando las comillas. */
function partirLinea(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === "," && !entreComillas) {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

function indiceDe(encabezados: string[], clave: keyof typeof ALIAS): number {
  const alias = ALIAS[clave].map(normalizar);
  return encabezados.findIndex((h) => alias.includes(normalizar(h)));
}

function entero(valor: string | undefined): number {
  const n = Number(String(valor ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface ResultadoImportacion {
  filas: FilaInsight[];
  /** Líneas que no se pudieron leer, con el motivo. Se muestran, no se esconden. */
  descartadas: { linea: number; motivo: string }[];
  /** El nivel más fino que trae el archivo. Define cómo se guarda. */
  nivel: "campaign" | "ad_set" | "ad";
}

/**
 * Convierte el contenido de un CSV en filas listas para guardar.
 *
 * No toca la base: es una función pura y por eso se puede probar sola.
 */
export function parsearCsvMeta(texto: string, monedaPorDefecto: "ARS" | "USD"): ResultadoImportacion {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) {
    throw new Error("El archivo no tiene filas de datos.");
  }

  const encabezados = partirLinea(lineas[0]);
  const idx = {
    campaignName: indiceDe(encabezados, "campaignName"),
    campaignId: indiceDe(encabezados, "campaignId"),
    adSetName: indiceDe(encabezados, "adSetName"),
    adSetId: indiceDe(encabezados, "adSetId"),
    adName: indiceDe(encabezados, "adName"),
    adId: indiceDe(encabezados, "adId"),
    date: indiceDe(encabezados, "date"),
    spend: indiceDe(encabezados, "spend"),
    impressions: indiceDe(encabezados, "impressions"),
    reach: indiceDe(encabezados, "reach"),
    clicks: indiceDe(encabezados, "clicks"),
    leads: indiceDe(encabezados, "leads"),
  };

  if (idx.campaignName === -1) {
    throw new Error(
      "No encontré la columna de campaña. Exportá el informe con el desglose por campaña y por día.",
    );
  }
  if (idx.date === -1) {
    throw new Error("No encontré la columna de fecha. Agregá el desglose por día al exportar.");
  }

  const nivel = idx.adName !== -1 ? "ad" : idx.adSetName !== -1 ? "ad_set" : "campaign";

  const filas: FilaInsight[] = [];
  const descartadas: { linea: number; motivo: string }[] = [];

  for (let i = 1; i < lineas.length; i++) {
    const c = partirLinea(lineas[i]);
    const campaignName = c[idx.campaignName] ?? "";
    const fechaCruda = c[idx.date] ?? "";
    const fecha = fechaCruda.slice(0, 10);

    if (!campaignName) {
      descartadas.push({ linea: i + 1, motivo: "sin nombre de campaña" });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      descartadas.push({ linea: i + 1, motivo: `fecha ilegible: "${fechaCruda}"` });
      continue;
    }

    filas.push({
      campaignExternalId: idx.campaignId === -1 ? "" : (c[idx.campaignId] ?? ""),
      campaignName,
      adSetExternalId: idx.adSetId === -1 ? undefined : c[idx.adSetId],
      adSetName: idx.adSetName === -1 ? undefined : c[idx.adSetName],
      adExternalId: idx.adId === -1 ? undefined : c[idx.adId],
      adName: idx.adName === -1 ? undefined : c[idx.adName],
      date: fecha,
      spendCents: parseAmountToCents(c[idx.spend] ?? "0") ?? 0,
      currency: monedaPorDefecto,
      impressions: entero(c[idx.impressions]),
      reach: entero(c[idx.reach]),
      clicks: entero(c[idx.clicks]),
      platformLeads: entero(c[idx.leads]),
    });
  }

  if (filas.length === 0) {
    throw new Error("No pude leer ninguna fila. Revisá que el archivo sea el export de Ads Manager.");
  }

  return { filas, descartadas, nivel };
}

export const adaptadorCsv: AdaptadorPlataforma = {
  plataforma: "meta",
  origen: "csv",
  nombre: "Importar CSV de Meta",
  necesitaCredenciales: false,

  async estado(clientId) {
    const fila = await one<{ ultima: string | null }>(
      `SELECT MAX(synced_at) AS ultima FROM ad_insights_daily
       WHERE client_id = ? AND source = 'csv'`,
      [clientId],
    );
    return { conectada: true, ultimaSync: fila?.ultima ?? null };
  },

  async traer() {
    throw new FuenteNoConectada(
      "meta",
      "El CSV no se descarga solo: subí el export de Ads Manager desde la ficha del cliente.",
    );
  },
};
