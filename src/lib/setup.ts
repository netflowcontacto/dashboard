import "server-only";
import { one } from "./db";
import { monthOf, todayISO } from "./dates";

/**
 * Estado de puesta en marcha.
 *
 * Un dashboard recién instalado muestra ceros en todas partes, y eso se lee
 * como "está roto" en vez de "todavía no cargaste nada". Esta lista dice
 * exactamente qué falta y dónde hacerlo, y desaparece sola cuando ya no aporta.
 */

export interface SetupStep {
  key: string;
  label: string;
  detail: string;
  href: string;
  done: boolean;
}

export interface SetupStatus {
  steps: SetupStep[];
  pending: number;
  /** true cuando el sistema todavía no tiene datos comerciales reales. */
  isFresh: boolean;
}

export async function setupStatus(): Promise<SetupStatus> {
  const period = monthOf(todayISO());

  // Una sola consulta para todos los conteos: son seis viajes de red menos
  // en cada carga del resumen.
  const row = await one<Record<string, number>>(
    `SELECT
       (SELECT COUNT(*) FROM objectives WHERE period = ?)   AS objectives,
       (SELECT COUNT(*) FROM leads)                         AS leads,
       (SELECT COUNT(*) FROM clients)                       AS clients,
       (SELECT COUNT(*) FROM expenses)                      AS expenses,
       (SELECT COUNT(*) FROM cash_snapshots)                AS cash,
       (SELECT COUNT(*) FROM users WHERE active = 1)        AS team`,
    [period],
  );

  const n = (v: number | undefined) => Number(v ?? 0);

  const steps: SetupStep[] = [
    {
      key: "equipo",
      label: "Dar de alta al equipo",
      detail: "Cada persona necesita su usuario para ver sus objetivos y tareas.",
      href: "/ajustes",
      done: n(row?.team) > 1,
    },
    {
      key: "objetivos",
      label: "Cargar los objetivos del mes",
      detail: "Sin objetivo no hay barra de progreso: el dashboard no inventa un número.",
      href: "/objetivos",
      done: n(row?.objectives) > 0,
    },
    {
      key: "clientes",
      label: "Cargar los clientes activos",
      detail: "Es lo que habilita MRR, ticket promedio y margen por cuenta.",
      href: "/clientes/nuevo",
      done: n(row?.clients) > 0,
    },
    {
      key: "crm",
      label: "Cargar las oportunidades abiertas",
      detail: "El funnel y el cuello de botella salen de acá.",
      href: "/crm/nueva",
      done: n(row?.leads) > 0,
    },
    {
      key: "gastos",
      label: "Cargar los gastos del mes",
      detail: "Habilita resultado, margen, burn y el CPL del funnel.",
      href: "/finanzas",
      done: n(row?.expenses) > 0,
    },
    {
      key: "caja",
      label: "Declarar el saldo de caja",
      detail: "Es la base del runway.",
      href: "/finanzas",
      done: n(row?.cash) > 0,
    },
  ];

  return {
    steps,
    pending: steps.filter((s) => !s.done).length,
    isFresh: n(row?.leads) === 0 && n(row?.clients) === 0,
  };
}
