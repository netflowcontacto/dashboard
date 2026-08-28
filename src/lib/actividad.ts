/**
 * Tipos de evento de la bitácora.
 *
 * Vive acá y no en `actions/actividad.ts` porque un archivo "use server" solo
 * puede exportar funciones async: exportar la lista desde ahí compila bien
 * pero rompe en runtime al renderizar la ficha del lead.
 */
export const TIPOS_ACTIVIDAD = ["llamada", "whatsapp", "email", "nota", "reunion"] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];
