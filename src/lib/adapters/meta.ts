import "server-only";
import { one, getSetting } from "../db";
import { FuenteNoConectada, type AdaptadorPlataforma, type FilaInsight } from "./tipos";

/**
 * Meta Ads API — declarada, no conectada.
 *
 * Este archivo existe para que el día que haya token no haya que diseñar
 * nada: la forma de la respuesta ya está fijada por `FilaInsight` y el resto
 * del sistema no se entera de dónde salió el dato. Mientras tanto `estado()`
 * dice la verdad y la pantalla muestra "Sin conectar" con lo que falta.
 *
 * Dos cosas a tener presentes cuando se conecte, y son de este año:
 *
 *  1. En enero de 2026 Meta sacó de la API las ventanas largas de atribución
 *     por visualización; la medición quedó en 1 día de clic. En marzo cambió
 *     además cómo cuenta las conversiones.
 *  2. Por eso `platform_leads` se guarda como referencia y nunca como verdad.
 *     El lead, el calificado, el turno y el cierre viven en nuestra base, que
 *     es la única que sabe qué pasó de verdad. Cuando los dos números no
 *     coincidan, gana el CRM.
 */

const CLAVE_TOKEN = "meta_ads_access_token";

export const adaptadorMeta: AdaptadorPlataforma = {
  plataforma: "meta",
  origen: "meta_api",
  nombre: "Meta Ads API",
  necesitaCredenciales: true,

  async estado(clientId) {
    const token = await getSetting(CLAVE_TOKEN, "");
    if (!token) {
      return {
        conectada: false,
        motivo: "Falta el token de acceso de Meta. Se carga en Integraciones.",
      };
    }

    const cuenta = await one<{ id: number }>(
      `SELECT id FROM ad_accounts
       WHERE client_id = ? AND platform = 'meta' AND external_id <> '' LIMIT 1`,
      [clientId],
    );
    if (!cuenta) {
      return {
        conectada: false,
        motivo: "Este cliente todavía no tiene una cuenta publicitaria de Meta asociada.",
      };
    }

    const fila = await one<{ ultima: string | null }>(
      `SELECT MAX(synced_at) AS ultima FROM ad_insights_daily
       WHERE client_id = ? AND source = 'meta_api'`,
      [clientId],
    );
    return { conectada: true, ultimaSync: fila?.ultima ?? null };
  },

  async traer(clientId): Promise<FilaInsight[]> {
    const estado = await this.estado(clientId);
    if (!estado.conectada) {
      throw new FuenteNoConectada("meta", estado.motivo);
    }
    // Con token y cuenta: acá va la llamada a /insights con
    // level=ad, time_increment=1 y los campos de FilaInsight.
    throw new FuenteNoConectada(
      "meta",
      "La conexión con Meta está declarada pero todavía no implementada. Mientras tanto, importá el CSV.",
    );
  },
};
