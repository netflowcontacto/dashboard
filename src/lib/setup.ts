import "server-only";
import { getDb } from "./db";
import { monthOf, todayISO } from "./dates";

/**
 * Estado de puesta en marcha.
 *
 * Un dashboard recién instalado muestra ceros en todas partes, y eso se lee
 * como "está roto" en vez de "todavía no cargaste nada". Esta lista dice
 * exactamente qué falta y dónde hacerlo, y desaparece sola cuando ya no
 * aporta nada.
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

function count(sql: string, params: unknown[] = []): number {
  const row = getDb().prepare(sql).get(...params) as { n: number };
  return row.n;
}

export function setupStatus(): SetupStatus {
  const period = monthOf(todayISO());

  const objectives = count("SELECT COUNT(*) AS n FROM objectives WHERE period = ?", [period]);
  const leads = count("SELECT COUNT(*) AS n FROM leads");
  const clients = count("SELECT COUNT(*) AS n FROM clients");
  const expenses = count("SELECT COUNT(*) AS n FROM expenses");
  const cash = count("SELECT COUNT(*) AS n FROM cash_snapshots");
  const team = count("SELECT COUNT(*) AS n FROM users WHERE active = 1");

  const steps: SetupStep[] = [
    {
      key: "equipo",
      label: "Dar de alta al equipo",
      detail: "Cada persona necesita su usuario para ver sus objetivos y tareas.",
      href: "/ajustes",
      done: team > 1,
    },
    {
      key: "objetivos",
      label: "Cargar los objetivos del mes",
      detail: "Sin objetivo no hay barra de progreso: el dashboard no inventa un número.",
      href: "/objetivos",
      done: objectives > 0,
    },
    {
      key: "clientes",
      label: "Cargar los clientes activos",
      detail: "Es lo que habilita MRR, ticket promedio y margen por cuenta.",
      href: "/clientes/nuevo",
      done: clients > 0,
    },
    {
      key: "crm",
      label: "Cargar las oportunidades abiertas",
      detail: "El funnel y el cuello de botella salen de acá.",
      href: "/crm/nueva",
      done: leads > 0,
    },
    {
      key: "gastos",
      label: "Cargar los gastos del mes",
      detail: "Habilita resultado, margen, burn y el CPL del funnel.",
      href: "/finanzas",
      done: expenses > 0,
    },
    {
      key: "caja",
      label: "Declarar el saldo de caja",
      detail: "Es la base del runway.",
      href: "/finanzas",
      done: cash > 0,
    },
  ];

  return {
    steps,
    pending: steps.filter((s) => !s.done).length,
    isFresh: leads === 0 && clients === 0,
  };
}
