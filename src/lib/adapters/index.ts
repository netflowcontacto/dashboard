import "server-only";
import { adaptadorCsv } from "./csv";
import { adaptadorManual } from "./manual";
import { adaptadorMeta } from "./meta";
import type { AdaptadorPlataforma, EstadoConexion } from "./tipos";

export * from "./tipos";
export { parsearCsvMeta } from "./csv";

/**
 * Las fuentes de gasto, en el orden en que se ofrecen.
 *
 * Las dos primeras funcionan hoy sin credenciales; por eso van primero. La
 * tercera se ofrece igual, con su estado real a la vista: es más honesto
 * mostrar "sin conectar" que esconder la opción.
 */
export const FUENTES: AdaptadorPlataforma[] = [adaptadorManual, adaptadorCsv, adaptadorMeta];

export interface EstadoFuente {
  nombre: string;
  origen: string;
  necesitaCredenciales: boolean;
  estado: EstadoConexion;
}

/** Estado de todas las fuentes para un cliente, para pintar la ficha. */
export async function estadoDeFuentes(clientId: number): Promise<EstadoFuente[]> {
  return Promise.all(
    FUENTES.map(async (f) => ({
      nombre: f.nombre,
      origen: f.origen,
      necesitaCredenciales: f.necesitaCredenciales,
      estado: await f.estado(clientId),
    })),
  );
}
