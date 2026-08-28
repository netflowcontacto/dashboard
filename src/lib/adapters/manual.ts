import "server-only";
import { one } from "../db";
import { FuenteNoConectada, type AdaptadorPlataforma, type FilaInsight } from "./tipos";

/**
 * Carga manual: el camino que NetFlow ya usa hoy.
 *
 * No trae nada de ninguna parte porque el dato entra por el formulario de
 * inversión. Existe como adaptador igual, para que la pantalla de fuentes
 * pueda mostrar "cargado a mano, última carga hace 2 días" con el mismo
 * lenguaje que usa para las demás.
 */
export const adaptadorManual: AdaptadorPlataforma = {
  plataforma: "otro",
  origen: "manual",
  nombre: "Carga manual",
  necesitaCredenciales: false,

  async estado(clientId) {
    const fila = await one<{ ultima: string | null }>(
      `SELECT MAX(synced_at) AS ultima FROM ad_insights_daily
       WHERE client_id = ? AND source = 'manual'`,
      [clientId],
    );
    return { conectada: true, ultimaSync: fila?.ultima ?? null };
  },

  async traer() {
    throw new FuenteNoConectada(
      "otro",
      "La carga manual no sincroniza: el gasto se carga desde Inversión publicitaria.",
    );
  },
};
