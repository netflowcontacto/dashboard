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
  dateEnd: ["reporting ends", "fin del informe", "ends", "hasta"],
  spend: ["amount spent", "importe gastado", "importe gasto", "gasto", "spend"],
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
  const exacto = encabezados.findIndex((h) => alias.includes(normalizar(h)));
  if (exacto !== -1) return exacto;
  // La columna del importe viene con la moneda pegada — "Importe gastado (USD)",
  // "Amount spent (ARS)" — y cambia según la cuenta. Se acepta el prefijo.
  return encabezados.findIndex((h) => alias.some((a) => normalizar(h).startsWith(a)));
}

/**
 * La moneda que declara el encabezado del importe.
 *
 * Ads Manager la escribe ahí: "Importe gastado (USD)". Leerla es mucho mejor
 * que preguntarla, porque equivocarse no se nota: si la cuenta paga en dólares
 * y alguien deja puesto pesos, el gasto queda mil veces más chico y todas las
 * métricas de costo mienten sin que nada falle.
 */
function monedaDelEncabezado(encabezado: string | undefined): "ARS" | "USD" | null {
  const m = String(encabezado ?? "").toUpperCase().match(/\b(USD|ARS)\b/);
  return m ? (m[1] as "ARS" | "USD") : null;
}

/**
 * Reparte un entero en `n` partes que suman exactamente el total.
 *
 * Se toma la diferencia entre dos acumulados redondeados hacia abajo, en vez
 * de dar el resto a los primeros días. Suma exactamente igual —no se pierde
 * ni se inventa un centavo— pero además el resto queda esparcido a lo largo
 * del período: mirar media quincena da la mitad del total, y no el piso.
 */
function repartir(total: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.floor((total * (i + 1)) / n) - Math.floor((total * i) / n),
  );
}

/** Los días del rango, inclusive. */
function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= Date.parse(`${hasta}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
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
  moneda: "ARS" | "USD";
  /** true si salió del encabezado; false si se usó la elegida a mano. */
  monedaDetectada: boolean;
  /** Cuántos días abarcaba el informe cuando no traía desglose diario. */
  repartidoEnDias: number | null;
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
    dateEnd: indiceDe(encabezados, "dateEnd"),
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

  // Si el encabezado dice la moneda, gana sobre lo que se haya elegido a mano.
  const monedaDetectada = monedaDelEncabezado(encabezados[idx.spend]);
  const moneda = monedaDetectada ?? monedaPorDefecto;

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

    const hastaCrudo = idx.dateEnd === -1 ? "" : (c[idx.dateEnd] ?? "").slice(0, 10);
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(hastaCrudo) && hastaCrudo > fecha ? hastaCrudo : null;

    filas.push({
      hasta,
      campaignExternalId: idx.campaignId === -1 ? "" : (c[idx.campaignId] ?? ""),
      campaignName,
      adSetExternalId: idx.adSetId === -1 ? undefined : c[idx.adSetId],
      adSetName: idx.adSetName === -1 ? undefined : c[idx.adSetName],
      adExternalId: idx.adId === -1 ? undefined : c[idx.adId],
      adName: idx.adName === -1 ? undefined : c[idx.adName],
      date: fecha,
      spendCents: parseAmountToCents(c[idx.spend] ?? "0") ?? 0,
      currency: moneda,
      impressions: entero(c[idx.impressions]),
      reach: entero(c[idx.reach]),
      clicks: entero(c[idx.clicks]),
      platformLeads: entero(c[idx.leads]),
    });
  }

  if (filas.length === 0) {
    throw new Error("No pude leer ninguna fila. Revisá que el archivo sea el export de Ads Manager.");
  }

  // Informes sin desglose por día.
  //
  // Ads Manager, si no se tilda "Día" al exportar, devuelve UNA fila por
  // campaña con el total del período y las columnas "Inicio del informe" y
  // "Fin del informe". Guardar eso tal cual deja todo el gasto del mes
  // apoyado en un solo día —el primero del informe—, y entonces la pantalla
  // aparece vacía en cuanto mirás cualquier otro período. Es exactamente el
  // caso de "lo cargué y no pasa nada".
  //
  // Se reparte en partes iguales entre los días del rango. Es un supuesto, y
  // por eso la pantalla lo dice: quien quiera el día real vuelve a exportar
  // con el desglose. El reparto no pierde ni inventa un centavo, así que el
  // total del período es exacto aunque cada día sea aproximado.
  let repartidoEnDias = 0;
  const expandidas: FilaInsight[] = [];
  for (const f of filas) {
    if (!f.hasta) {
      expandidas.push(f);
      continue;
    }
    const dias = diasEntre(f.date, f.hasta);
    repartidoEnDias = Math.max(repartidoEnDias, dias.length);

    const gasto = repartir(f.spendCents, dias.length);
    const impr = repartir(f.impressions, dias.length);
    const alc = repartir(f.reach, dias.length);
    const clk = repartir(f.clicks, dias.length);
    const lds = repartir(f.platformLeads, dias.length);

    dias.forEach((d, i) => {
      expandidas.push({
        ...f,
        hasta: null,
        date: d,
        spendCents: gasto[i],
        impressions: impr[i],
        reach: alc[i],
        clicks: clk[i],
        platformLeads: lds[i],
      });
    });
  }

  return {
    filas: expandidas,
    descartadas,
    nivel,
    moneda,
    monedaDetectada: monedaDetectada !== null,
    repartidoEnDias: repartidoEnDias || null,
  };
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
