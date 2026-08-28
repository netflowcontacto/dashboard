import type { Area, Role, User } from "./types";

/**
 * Modelo de permisos de NetFlow.
 *
 * La línea es una sola y es fácil de explicar:
 *
 *   TODO EL EQUIPO VE TODA LA OPERACIÓN.
 *   El CRM completo, la ficha de cada cliente, el funnel entero con inversión
 *   y CPL, los objetivos de todos, los resultados de todo el equipo, las
 *   tareas, el calendario y las alertas. Nadie tiene que pedir permiso para
 *   ver cómo viene el mes.
 *
 *   LOS NÚMEROS DE FACTURACIÓN SON DE DIRECCIÓN.
 *   Caja, MRR, facturación cobrada y pendiente, márgenes, resultado, runway,
 *   gastos y el fee de cada cliente viven en la sección de Administración.
 *
 * Administrar (cargar gastos, definir objetivos, dar de alta gente, cambiar
 * ajustes) también es de dirección, aunque el dato sea visible para todos.
 *
 * `visibilidad_equipo = restringida` en Ajustes cierra además el funnel y los
 * resultados individuales de terceros, dejando a cada persona solo con lo
 * suyo. No es el modo por defecto.
 */

export type Capability =
  | "finanzas:ver"        // caja, márgenes, runway, resultado, gastos
  | "finanzas:cargar"     // alta y edición de gastos y facturación
  | "paid_media:cargar"   // gastos de inversión publicitaria únicamente
  | "funnel:ver"          // funnel completo con CAC y revenue
  | "clientes:ver_fees"   // fee mensual y estado de cobro de cada cliente
  | "clientes:ver"        // ficha operativa de clientes
  | "clientes:editar"     // estado, onboarding, semáforo
  | "crm:ver_todo"
  | "crm:editar"
  | "tareas:editar"       // crear y mover tareas propias y del equipo
  | "archivos:subir"      // adjuntar archivos a oportunidades, clientes y tareas
  | "equipo:ver_todos"    // resultados individuales de todo el equipo
  | "objetivos:cargar"
  | "usuarios:gestionar"
  | "ajustes:gestionar";

/** Lo que puede hacer cualquier persona del equipo, en cualquier modo. */
const BASE: Capability[] = [
  "crm:ver_todo",
  "crm:editar",
  "clientes:ver",
  "clientes:editar",
  "tareas:editar",
  "archivos:subir",
];

/**
 * Lo que se abre al equipo en modo transparente (el de fábrica).
 * Nunca incluye información de facturación: eso no depende de este modo.
 */
const OPEN_EXTRA: Capability[] = ["funnel:ver", "equipo:ver_todos"];

/** Permisos que suma el área a la que pertenece la persona. */
const BY_AREA: Partial<Record<Area, Capability[]>> = {
  paid_media: ["paid_media:cargar"],
};

const ADMIN: Capability[] = [
  "finanzas:ver",
  "finanzas:cargar",
  "paid_media:cargar",
  "funnel:ver",
  "clientes:ver_fees",
  "clientes:ver",
  "clientes:editar",
  "crm:ver_todo",
  "crm:editar",
  "tareas:editar",
  "archivos:subir",
  "equipo:ver_todos",
  "objetivos:cargar",
  "usuarios:gestionar",
  "ajustes:gestionar",
];

/**
 * Persona con su modo de visibilidad ya resuelto.
 *
 * El modo vive en la configuración, que es una consulta a la base. Se resuelve
 * UNA vez al empezar la petición y desde ahí `can()` es sincrónico: si no,
 * habría que poner `await` en cada verificación de permiso de cada pantalla.
 */
export interface Viewer extends User {
  canViewAll: boolean;
}

export function capabilities(viewer: Pick<Viewer, "role" | "area" | "canViewAll">): Set<Capability> {
  if (viewer.role === "admin") return new Set(ADMIN);

  return new Set<Capability>([
    ...BASE,
    ...(viewer.canViewAll ? OPEN_EXTRA : []),
    ...(BY_AREA[viewer.area] ?? []),
  ]);
}

export function can(
  viewer: Pick<Viewer, "role" | "area" | "canViewAll">,
  capability: Capability,
): boolean {
  return capabilities(viewer).has(capability);
}

export function isAdmin(user: Pick<User, "role">): boolean {
  return user.role === "admin";
}

/**
 * Una persona siempre puede ver su propio resultado. Ver el de otra requiere
 * "equipo:ver_todos" — abierto para todos en modo transparente.
 */
export function canSeeIndividualResults(
  viewer: Pick<Viewer, "id" | "role" | "area" | "canViewAll">,
  targetUserId: number,
): boolean {
  return viewer.id === targetUserId || can(viewer, "equipo:ver_todos");
}

export function homeFor(user: Pick<User, "role">): string {
  return user.role === "admin" ? "/resumen" : "/mi-panel";
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Dirección",
  member: "Equipo",
};
