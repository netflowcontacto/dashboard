import "server-only";
import { all, one, getSetting } from "./db";
import { addDays, monthOf, todayISO } from "./dates";
import { companyProgress, periodElapsedPct } from "./metrics/objectives";
import { can } from "./permissions";
import type { Viewer } from "./permissions";

/**
 * Alertas.
 *
 * Se calculan en vivo a partir del estado real, no se guardan. Ventaja: no
 * hay alertas fantasma que sobreviven al problema que las genero. Cada alerta
 * dice QUE pasa, A QUIEN le corresponde y DONDE resolverlo.
 *
 * Cada alerta declara su `visibility`: las financieras nunca llegan al panel
 * del equipo. El filtrado se hace en `alertsFor()`, del lado del servidor.
 */

export type AlertSeverity = "info" | "atencion" | "urgente";
export type AlertVisibility = "todos" | "solo_admin";

export interface Alert {
  id: string;
  kind: string;
  severity: AlertSeverity;
  visibility: AlertVisibility;
  title: string;
  detail: string;
  href: string;
  ownerId: number | null;
  ownerName: string | null;
}

async function numberSetting(key: string, fallback: number): Promise<number> {
  const v = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export async function computeAlerts(asOf = todayISO()): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const slaHours = await numberSetting("sla_primer_contacto_horas", 24);

  // --- Lead sin contactar dentro del SLA ---
  const uncontacted = await all<{ id: number; name: string; owner_id: number; owner_name: string | null; horas: number }>(
      `SELECT l.id, l.name, l.owner_id, u.name AS owner_name,
              round(EXTRACT(EPOCH FROM (?::timestamp - l.created_at::timestamp)) / 3600.0) AS horas
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id
       WHERE l.outcome = 'open' AND l.first_contacted_at IS NULL
         AND EXTRACT(EPOCH FROM (?::timestamp - l.created_at::timestamp)) / 3600.0 >= ?
       ORDER BY l.created_at`,
      [`${asOf} 23:59:59`, `${asOf} 23:59:59`, slaHours],
  );

  for (const l of uncontacted) {
    alerts.push({
      id: `lead_sin_contactar:${l.id}`,
      kind: "lead_sin_contactar",
      severity: l.horas >= slaHours * 2 ? "urgente" : "atencion",
      visibility: "todos",
      title: `Lead sin contactar: ${l.name}`,
      detail: `Ingreso hace ${Math.round(l.horas)} h. SLA de primer contacto: ${slaHours} h.`,
      href: `/crm/${l.id}`,
      ownerId: l.owner_id,
      ownerName: l.owner_name,
    });
  }

  // --- Lead abierto sin próxima acción (la base ya lo impide, esto detecta datos viejos) ---
  const noNextAction = await all<{ id: number; name: string; owner_id: number; owner_name: string | null }>(
      `SELECT l.id, l.name, l.owner_id, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id
       WHERE l.outcome = 'open'
         AND (l.next_action IS NULL OR trim(l.next_action) = '' OR l.next_action_date IS NULL)`,
      [],
  );

  for (const l of noNextAction) {
    alerts.push({
      id: `lead_sin_proxima_accion:${l.id}`,
      kind: "lead_sin_proxima_accion",
      severity: "urgente",
      visibility: "todos",
      title: `Sin próxima acción: ${l.name}`,
      detail: "Toda oportunidad abierta tiene que tener próxima acción y fecha.",
      href: `/crm/${l.id}`,
      ownerId: l.owner_id,
      ownerName: l.owner_name,
    });
  }

  // --- Próxima acción vencida ---
  const overdue = await all<{
      id: number; name: string; next_action: string; next_action_date: string;
      owner_id: number; owner_name: string | null;
    }>(
      `SELECT l.id, l.name, l.next_action, l.next_action_date, l.owner_id, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id
       WHERE l.outcome = 'open' AND l.next_action_date IS NOT NULL AND l.next_action_date < ?
       ORDER BY l.next_action_date`,
      [asOf],
  );

  for (const l of overdue) {
    alerts.push({
      id: `accion_vencida:${l.id}`,
      kind: "accion_vencida",
      severity: "atencion",
      visibility: "todos",
      title: `Acción vencida: ${l.name}`,
      detail: `"${l.next_action}" vencía el ${l.next_action_date}.`,
      href: `/crm/${l.id}`,
      ownerId: l.owner_id,
      ownerName: l.owner_name,
    });
  }

  // --- Reunión próxima (48 h) ---
  const upcoming = await all<{ id: number; name: string; meeting_at: string; closer_id: number | null; owner_name: string | null }>(
      `SELECT l.id, l.name, l.meeting_at, l.closer_id, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.closer_id
       WHERE l.meeting_outcome = 'agendada'
         AND substr(l.meeting_at,1,10) BETWEEN ? AND ?
       ORDER BY l.meeting_at`,
      [asOf, addDays(asOf, 2)],
  );

  for (const l of upcoming) {
    alerts.push({
      id: `reunion_proxima:${l.id}`,
      kind: "reunion_proxima",
      severity: "info",
      visibility: "todos",
      title: `Reunión próxima: ${l.name}`,
      detail: `Agendada para ${l.meeting_at.replace("T", " ").slice(0, 16)}.`,
      href: `/crm/${l.id}`,
      ownerId: l.closer_id,
      ownerName: l.owner_name,
    });
  }

  // --- No-show sin recuperar ---
  const noShows = await all<{ id: number; name: string; setter_id: number | null; owner_name: string | null }>(
      `SELECT l.id, l.name, l.setter_id, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.setter_id
       WHERE l.meeting_outcome = 'no_show' AND l.recovered_from_noshow = 0 AND l.outcome = 'open'`,
      [],
  );

  for (const l of noShows) {
    alerts.push({
      id: `no_show:${l.id}`,
      kind: "no_show",
      severity: "atencion",
      visibility: "todos",
      title: `No-show sin recuperar: ${l.name}`,
      detail: "Reagendar o cerrar la oportunidad con motivo.",
      href: `/crm/${l.id}`,
      ownerId: l.setter_id,
      ownerName: l.owner_name,
    });
  }

  // --- Propuesta sin follow-up ---
  const followUpDays = await numberSetting("dias_follow_up_propuesta", 5);
  const staleProposals = await all<{
      id: number; name: string; proposal_sent_at: string; owner_id: number; owner_name: string | null;
    }>(
      `SELECT l.id, l.name, l.proposal_sent_at, l.owner_id, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id
       WHERE l.outcome = 'open' AND l.proposal_sent_at IS NOT NULL
         AND substr(l.proposal_sent_at,1,10) <= ?
         AND NOT EXISTS (
           SELECT 1 FROM lead_events e
           WHERE e.lead_id = l.id
             AND e.type IN ('follow_up','llamada','whatsapp','email','reunion')
             AND e.at > l.proposal_sent_at
         )`,
      [addDays(asOf, -followUpDays)],
  );

  for (const l of staleProposals) {
    alerts.push({
      id: `propuesta_sin_follow_up:${l.id}`,
      kind: "propuesta_sin_follow_up",
      severity: "atencion",
      visibility: "todos",
      title: `Propuesta sin follow-up: ${l.name}`,
      detail: `Enviada el ${l.proposal_sent_at.slice(0, 10)} y sin seguimiento registrado.`,
      href: `/crm/${l.id}`,
      ownerId: l.owner_id,
      ownerName: l.owner_name,
    });
  }

  // --- Clientes: pago pendiente / cuenta en riesgo ---
  const paymentIssues = await all<{ id: number; name: string; payment_status: string; next_charge_date: string | null }>(
      `SELECT id, name, payment_status, next_charge_date FROM clients
       WHERE churned_at IS NULL AND payment_status <> 'al_dia'`,
      [],
  );

  for (const c of paymentIssues) {
    alerts.push({
      id: `pago_pendiente:${c.id}`,
      kind: "pago_pendiente",
      severity: c.payment_status === "vencido" ? "urgente" : "atencion",
      visibility: "solo_admin",
      title: `Cobro ${c.payment_status}: ${c.name}`,
      detail: c.next_charge_date ? `Próximo cobro: ${c.next_charge_date}.` : "Sin fecha de próximo cobro.",
      href: `/clientes/${c.id}`,
      ownerId: null,
      ownerName: null,
    });
  }

  const atRisk = await all<{ id: number; name: string; account_health: string; alerts_note: string }>(
      `SELECT id, name, account_health, alerts_note FROM clients
       WHERE churned_at IS NULL AND account_health <> 'bien'`,
      [],
  );

  for (const c of atRisk) {
    alerts.push({
      id: `cliente_${c.account_health}:${c.id}`,
      kind: c.account_health === "riesgo" ? "cliente_en_riesgo" : "cliente_atencion",
      severity: c.account_health === "riesgo" ? "urgente" : "atencion",
      visibility: "todos",
      title: `Cuenta en ${c.account_health}: ${c.name}`,
      detail: c.alerts_note || "Revisar estado general de la cuenta.",
      href: `/clientes/${c.id}`,
      ownerId: null,
      ownerName: null,
    });
  }

  // --- Onboarding trabado ---
  const onboarding = await all<{ id: number; name: string; start_date: string }>(
      `SELECT id, name, start_date FROM clients
       WHERE churned_at IS NULL AND onboarding_status <> 'completo' AND start_date <= ?`,
      [addDays(asOf, -14)],
  );

  for (const c of onboarding) {
    alerts.push({
      id: `onboarding_trabado:${c.id}`,
      kind: "onboarding_trabado",
      severity: "atencion",
      visibility: "todos",
      title: `Onboarding sin cerrar: ${c.name}`,
      detail: `Alta del ${c.start_date} y el onboarding sigue abierto.`,
      href: `/clientes/${c.id}`,
      ownerId: null,
      ownerName: null,
    });
  }

  // --- Tareas vencidas y bloqueos ---
  const lateTasks = await all<{
      id: number; title: string; due_date: string; assignee_id: number | null; owner_name: string | null;
    }>(
      `SELECT t.id, t.title, t.due_date, t.assignee_id, u.name AS owner_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.status IN ('pendiente','en_curso','bloqueado')
         AND t.due_date IS NOT NULL AND t.due_date < ?`,
      [asOf],
  );

  for (const t of lateTasks) {
    alerts.push({
      id: `tarea_vencida:${t.id}`,
      kind: "tarea_vencida",
      severity: "atencion",
      visibility: "todos",
      title: `Tarea vencida: ${t.title}`,
      detail: `Vencía el ${t.due_date}.`,
      href: "/tareas",
      ownerId: t.assignee_id,
      ownerName: t.owner_name,
    });
  }

  const blocked = await all<{
      id: number; title: string; blocker: string; assignee_id: number | null; owner_name: string | null;
    }>(
      `SELECT t.id, t.title, t.blocker, t.assignee_id, u.name AS owner_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.status = 'bloqueado'`,
      [],
  );

  for (const t of blocked) {
    alerts.push({
      id: `bloqueo:${t.id}`,
      kind: "bloqueo",
      severity: "atencion",
      visibility: "todos",
      title: `Bloqueo: ${t.title}`,
      detail: t.blocker,
      href: "/tareas",
      ownerId: t.assignee_id,
      ownerName: t.owner_name,
    });
  }

  // --- Objetivo mensual atrasado ---
  const period = monthOf(asOf);
  const company = await companyProgress(period, asOf);
  const elapsed = periodElapsedPct(period, asOf);
  for (const o of company.objectives) {
    if (o.pct !== null && o.pct < elapsed - 15) {
      alerts.push({
        id: `objetivo_atrasado:${o.objective.id}`,
        kind: "objetivo_atrasado",
        severity: elapsed > 70 ? "urgente" : "atencion",
        visibility: "todos",
        title: `Objetivo atrasado: ${o.label}`,
        detail: `${fmtNum(o.current)} de ${fmtNum(o.target)} con ${Math.round(elapsed)}% del mes transcurrido.`,
        href: "/objetivos",
        ownerId: null,
        ownerName: null,
      });
    }
  }

  // --- Campaña sin resultado: inversión sin leads ---
  const badCampaigns = await all<{ campaign: string; cents: number }>(
      `SELECT campaign, SUM(amount_cents) AS cents FROM expenses
       WHERE category = 'paid_media' AND campaign <> '' AND date BETWEEN ? AND ?
       GROUP BY campaign`,
      [addDays(asOf, -7), asOf],
  );

  if (badCampaigns.length > 0) {
    const leadsLastWeek = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM leads WHERE entered_at BETWEEN ? AND ?`,
      [addDays(asOf, -7), asOf],
    );
    if (Number(leadsLastWeek?.n ?? 0) === 0) {
      alerts.push({
        id: "campana_sin_leads",
        kind: "campana_con_problema",
        severity: "urgente",
        visibility: "todos",
        title: "Inversión publicitaria sin leads",
        detail: "Hubo inversión en los últimos 7 días y no ingreso ningún lead.",
        href: "/funnel",
        ownerId: null,
        ownerName: null,
      });
    }
  }

  const order: Record<AlertSeverity, number> = { urgente: 0, atencion: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

function fmtNum(v: number | null): string {
  if (v === null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Alertas visibles para una persona.
 *  - admin: todas
 *  - equipo: nunca las financieras; y solo las que le corresponden a esa
 *    persona o las que no tienen responsable asignado (avisos generales).
 */
export async function alertsFor(viewer: Viewer, asOf = todayISO()): Promise<Alert[]> {
  const alerts = await computeAlerts(asOf);
  // Con visibilidad abierta todo el equipo ve todas las alertas. En modo
  // restringido, cada persona ve las suyas y las que no tienen responsable.
  if (can(viewer, "finanzas:ver")) return alerts;
  return alerts.filter(
    (a) => a.visibility === "todos" && (a.ownerId === null || a.ownerId === viewer.id),
  );
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  urgente: "Urgente",
  atencion: "Atención",
  info: "Info",
};
