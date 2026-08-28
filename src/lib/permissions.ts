import type { Area, Role, User } from "./types";

/**
 * Modelo de permisos de NetFlow.
 *
 * Principio: el dashboard del equipo NO muestra caja total, margenes, capital
 * disponible, rentabilidad ni costos de otras personas. Eso se garantiza acá,
 * en un solo lugar, y se verifica del lado del servidor en cada pagina.
 */

export type Capability =
  | "finanzas:ver"        // caja, margenes, runway, resultado, todos los gastos
  | "finanzas:cargar"     // alta/edicion de gastos de cualquier categoria
  | "paid_media:cargar"   // alta/edicion de gastos de inversion publicitaria unicamente
  | "funnel:ver"          // funnel completo con CAC y revenue
  | "clientes:ver_fees"   // fee mensual y estado de cobro de cada cliente
  | "clientes:ver"        // ficha operativa de clientes, sin numeros de facturacion
  | "crm:ver_todo"        // todas las oportunidades
  | "crm:editar"
  | "equipo:ver_todos"    // resultados individuales de todo el equipo
  | "objetivos:cargar"
  | "usuarios:gestionar"
  | "ajustes:gestionar";

const MEMBER_BASE: Capability[] = ["crm:ver_todo", "crm:editar", "clientes:ver"];

const BY_AREA: Partial<Record<Area, Capability[]>> = {
  paid_media: ["paid_media:cargar"],
};

export function capabilities(user: Pick<User, "role" | "area">): Set<Capability> {
  if (user.role === "admin") {
    return new Set<Capability>([
      "finanzas:ver",
      "finanzas:cargar",
      "paid_media:cargar",
      "funnel:ver",
      "clientes:ver_fees",
      "clientes:ver",
      "crm:ver_todo",
      "crm:editar",
      "equipo:ver_todos",
      "objetivos:cargar",
      "usuarios:gestionar",
      "ajustes:gestionar",
    ]);
  }
  return new Set<Capability>([...MEMBER_BASE, ...(BY_AREA[user.area] ?? [])]);
}

export function can(user: Pick<User, "role" | "area">, capability: Capability): boolean {
  return capabilities(user).has(capability);
}

export function isAdmin(user: Pick<User, "role">): boolean {
  return user.role === "admin";
}

/**
 * Una persona siempre puede ver su propio resultado. Ver el de otro requiere
 * "equipo:ver_todos". Esto es lo que evita que el panel del equipo se convierta
 * en un ranking publico entre companeros.
 */
export function canSeeIndividualResults(
  viewer: Pick<User, "id" | "role" | "area">,
  targetUserId: number,
): boolean {
  return viewer.id === targetUserId || can(viewer, "equipo:ver_todos");
}

export function homeFor(user: Pick<User, "role">): string {
  return user.role === "admin" ? "/resumen" : "/mi-panel";
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  member: "Equipo",
};
