"use server";

import { revalidatePath } from "next/cache";
import { tx, type Tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { parsearCsvMeta } from "@/lib/adapters/csv";
import { errorMessage } from "@/lib/errors";
import * as F from "@/lib/form";
import type { FilaInsight } from "@/lib/adapters/tipos";

/**
 * Importación del informe de Meta Ads Manager.
 *
 * Es el camino que funciona hoy sin credenciales, sin app y sin esperar
 * aprobaciones: se baja el CSV con desglose por día y se sube acá.
 *
 * Dos propiedades que importan:
 *
 *  - Es idempotente. Subir dos veces el mismo archivo no duplica el gasto:
 *    cada fila se identifica por campaña + día + nivel, y si ya estaba se
 *    reemplaza. Eso permite volver a subir un mes entero cuando Meta corrige
 *    cifras hacia atrás, que lo hace seguido.
 *  - No inventa jerarquía. Si el archivo no trae anuncios, no se crean
 *    anuncios vacíos: el gasto queda a nivel campaña y la vista
 *    `ad_insights_effective` se encarga de que no se cuente dos veces el día
 *    que entren filas más finas.
 */

export interface ResultadoImport {
  ok?: string;
  error?: string;
  /** Líneas que no se pudieron leer, con el motivo. Se muestran, no se esconden. */
  descartadas?: { linea: number; motivo: string }[];
  detalle?: { filas: number; campanas: number; anuncios: number; desde: string; hasta: string };
}

/** Busca por id externo si lo hay, y si no por nombre. Crea si no existe. */
async function idDe(
  q: Tx,
  tabla: "campaigns" | "ad_sets" | "ads",
  externalId: string,
  nombre: string,
  crear: () => Promise<number>,
  ambito: { col: string; valor: number },
): Promise<number> {
  if (externalId) {
    const porId = await q.one<{ id: number }>(
      `SELECT id FROM ${tabla} WHERE external_id = ? AND ${ambito.col} = ? LIMIT 1`,
      [externalId, ambito.valor],
    );
    if (porId) return porId.id;
  }
  const porNombre = await q.one<{ id: number }>(
    `SELECT id FROM ${tabla} WHERE name = ? AND ${ambito.col} = ? LIMIT 1`,
    [nombre, ambito.valor],
  );
  if (porNombre) return porNombre.id;
  return crear();
}

export async function importarCsvMeta(
  _prev: ResultadoImport,
  fd: FormData,
): Promise<ResultadoImport> {
  const user = await requireUser();
  if (!can(user, "paid_media:cargar")) {
    return { error: "No tenés permiso para cargar inversión publicitaria." };
  }

  const clientId = F.optInt(fd, "client_id");
  if (!clientId) return { error: "Elegí de qué cliente es este informe." };

  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Subí el archivo CSV que exporta Ads Manager." };
  }

  const moneda = F.pick(fd, "moneda", ["ARS", "USD"] as const, "ARS");

  let parseado;
  try {
    parseado = parsearCsvMeta(await archivo.text(), moneda);
  } catch (e) {
    return { error: errorMessage(e) };
  }

  const { filas, descartadas, nivel } = parseado;

  try {
    const resumen = await tx(async (q) => {
      // Una cuenta publicitaria por cliente y plataforma. Si no existe, se crea:
      // el informe no trae el id de la cuenta, y obligar a darla de alta antes
      // convertiría una subida de archivo en un trámite de tres pantallas.
      const cuenta =
        (await q.one<{ id: number }>(
          "SELECT id FROM ad_accounts WHERE client_id = ? AND platform = 'meta' LIMIT 1",
          [clientId],
        )) ??
        ({
          id: await q.insert(
            `INSERT INTO ad_accounts (client_id, platform, name, currency)
             VALUES (?, 'meta', 'Meta Ads', ?) RETURNING id`,
            [clientId, moneda],
          ),
        } as { id: number });

      const campanas = new Map<string, number>();
      const conjuntos = new Map<string, number>();
      const anuncios = new Map<string, number>();

      for (const f of filas) {
        const claveCamp = f.campaignExternalId || f.campaignName;
        if (!campanas.has(claveCamp)) {
          campanas.set(
            claveCamp,
            await idDe(q, "campaigns", f.campaignExternalId, f.campaignName, () =>
              q.insert(
                `INSERT INTO campaigns (ad_account_id, client_id, external_id, name, status)
                 VALUES (?,?,?,?, 'activa') RETURNING id`,
                [cuenta.id, clientId, f.campaignExternalId, f.campaignName],
              ),
              { col: "ad_account_id", valor: cuenta.id },
            ),
          );
        }
        const campaignId = campanas.get(claveCamp)!;

        let adSetId: number | null = null;
        if (nivel !== "campaign" && f.adSetName) {
          const clave = `${campaignId}|${f.adSetExternalId || f.adSetName}`;
          if (!conjuntos.has(clave)) {
            conjuntos.set(
              clave,
              await idDe(q, "ad_sets", f.adSetExternalId ?? "", f.adSetName, () =>
                q.insert(
                  `INSERT INTO ad_sets (campaign_id, client_id, external_id, name, status)
                   VALUES (?,?,?,?, 'activa') RETURNING id`,
                  [campaignId, clientId, f.adSetExternalId ?? "", f.adSetName],
                ),
                { col: "campaign_id", valor: campaignId },
              ),
            );
          }
          adSetId = conjuntos.get(clave)!;
        }

        let adId: number | null = null;
        if (nivel === "ad" && adSetId && f.adName) {
          const clave = `${adSetId}|${f.adExternalId || f.adName}`;
          if (!anuncios.has(clave)) {
            anuncios.set(
              clave,
              await idDe(q, "ads", f.adExternalId ?? "", f.adName, () =>
                q.insert(
                  `INSERT INTO ads (ad_set_id, client_id, external_id, name, status)
                   VALUES (?,?,?,?, 'activo') RETURNING id`,
                  [adSetId, clientId, f.adExternalId ?? "", f.adName],
                ),
                { col: "ad_set_id", valor: adSetId },
              ),
            );
          }
          adId = anuncios.get(clave)!;
        }

        // Idempotente: la misma campaña, el mismo día y el mismo nivel se
        // reemplazan. Así se puede volver a subir el mes cuando Meta corrige.
        await q.run(
          `INSERT INTO ad_insights_daily
             (client_id, campaign_id, ad_set_id, ad_id, level, date, spend_cents, currency,
              impressions, reach, clicks, platform_leads, source, synced_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'csv', nf_now())
           ON CONFLICT (campaign_id, date, level, COALESCE(ad_set_id, 0), COALESCE(ad_id, 0))
           DO UPDATE SET
             spend_cents = EXCLUDED.spend_cents, currency = EXCLUDED.currency,
             impressions = EXCLUDED.impressions, reach = EXCLUDED.reach,
             clicks = EXCLUDED.clicks, platform_leads = EXCLUDED.platform_leads,
             source = 'csv', synced_at = nf_now()`,
          [
            clientId, campaignId, adSetId, adId, nivel, f.date,
            f.spendCents, f.currency, f.impressions, f.reach, f.clicks, f.platformLeads,
          ],
        );
      }

      const fechas = filas.map((f) => f.date).sort();
      return {
        filas: filas.length,
        campanas: campanas.size,
        anuncios: anuncios.size,
        desde: fechas[0],
        hasta: fechas[fechas.length - 1],
      };
    });

    revalidatePath("/anuncios");
    revalidatePath("/inversion");

    return {
      ok: `Listo: ${resumen.filas} ${resumen.filas === 1 ? "fila" : "filas"} del ${resumen.desde} al ${resumen.hasta}.`,
      detalle: resumen,
      descartadas: descartadas.length > 0 ? descartadas : undefined,
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
