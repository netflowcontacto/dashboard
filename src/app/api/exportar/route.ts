import { all } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { EXPENSE_CATEGORY_LABEL, STAGE_LABEL, type ExpenseCategory, type Stage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exportación a CSV.
 *
 * Un dashboard no reemplaza una planilla: para pasarle números al contador o
 * cruzar datos puntuales, bajar el CSV es más rápido que cualquier vista.
 *
 * Los permisos son los mismos que en pantalla: gastos y facturas solo para
 * dirección, y los fees de clientes solo si la persona puede verlos.
 */

/** Escapa un valor de celda. El prefijo evita que Excel ejecute fórmulas. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(";"), ...rows.map((r) => r.map(cell).join(";"))];
  // BOM + separador ';' para que Excel en español lo abra en columnas.
  return `﻿${lines.join("\r\n")}`;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("tipo") ?? "";
  const from = url.searchParams.get("from") ?? "1900-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";

  let name = "netflow";
  let body = "";

  if (kind === "gastos") {
    if (!can(user, "finanzas:ver")) return new Response("Sin permiso", { status: 403 });
    const rows = await all<Record<string, string | number | null>>(
        `SELECT e.date, e.concept, e.category, e.amount_cents, e.currency, e.cost_type,
                e.recurrence, e.vendor, e.status, e.direct_cost, e.platform, e.campaign,
                c.name AS client_name, e.notes
         FROM expenses e LEFT JOIN clients c ON c.id = e.client_id
         WHERE e.date BETWEEN ? AND ? ORDER BY e.date DESC`,
        [from, to],
    );

    name = `netflow-gastos-${from}_${to}`;
    body = csv(
      ["Fecha", "Concepto", "Categoría", "Importe", "Moneda", "Tipo", "Recurrencia",
       "Proveedor", "Estado", "Costo directo", "Plataforma", "Campaña", "Cliente", "Notas"],
      rows.map((r) => [
        r.date, r.concept,
        EXPENSE_CATEGORY_LABEL[r.category as ExpenseCategory] ?? r.category,
        money(Number(r.amount_cents)), r.currency, r.cost_type, r.recurrence,
        r.vendor, r.status, r.direct_cost === 1 ? "sí" : "no",
        r.platform, r.campaign, r.client_name, r.notes,
      ]),
    );
  } else if (kind === "facturas") {
    if (!can(user, "finanzas:ver")) return new Response("Sin permiso", { status: 403 });
    const rows = await all<Record<string, string | number | null>>(
        `SELECT i.issued_at, i.period, c.name AS client_name, i.concept, i.amount_cents,
                i.currency, i.status, i.due_at, i.paid_at
         FROM invoices i JOIN clients c ON c.id = i.client_id
         WHERE i.issued_at BETWEEN ? AND ? ORDER BY i.issued_at DESC`,
        [from, to],
    );

    name = `netflow-facturas-${from}_${to}`;
    body = csv(
      ["Emitida", "Período", "Cliente", "Concepto", "Importe", "Moneda", "Estado", "Vence", "Cobrada el"],
      rows.map((r) => [
        r.issued_at, r.period, r.client_name, r.concept,
        money(Number(r.amount_cents)), r.currency, r.status, r.due_at, r.paid_at,
      ]),
    );
  } else if (kind === "crm") {
    const rows = await all<Record<string, string | number | null>>(
        `SELECT l.entered_at, l.name, l.company, l.specialty, l.source, l.stage, l.outcome,
                o.name AS owner_name, s.name AS setter_name, cl.name AS closer_name,
                l.next_action, l.next_action_date, l.meeting_at, l.meeting_outcome,
                l.plan_interest, l.potential_value_cents, l.potential_currency,
                l.proposal_sent_at, l.closed_at, l.lost_reason, l.contact_email, l.contact_phone
         FROM leads l
         LEFT JOIN users o  ON o.id  = l.owner_id
         LEFT JOIN users s  ON s.id  = l.setter_id
         LEFT JOIN users cl ON cl.id = l.closer_id
         WHERE l.entered_at BETWEEN ? AND ? ORDER BY l.entered_at DESC`,
        [from, to],
    );

    name = `netflow-crm-${from}_${to}`;
    body = csv(
      ["Ingreso", "Nombre", "Empresa", "Especialidad", "Origen", "Etapa", "Resultado",
       "Responsable", "Setter", "Closer", "Próxima acción", "Fecha próxima acción",
       "Reunión", "Estado reunión", "Plan de interés", "Valor potencial", "Moneda",
       "Propuesta enviada", "Cierre", "Motivo de pérdida", "Email", "Teléfono"],
      rows.map((r) => [
        r.entered_at, r.name, r.company, r.specialty, r.source,
        STAGE_LABEL[r.stage as Stage] ?? r.stage,
        r.outcome === "won" ? "ganada" : r.outcome === "lost" ? "perdida" : "abierta",
        r.owner_name, r.setter_name, r.closer_name, r.next_action, r.next_action_date,
        r.meeting_at, r.meeting_outcome, r.plan_interest,
        money(Number(r.potential_value_cents)), r.potential_currency,
        r.proposal_sent_at, r.closed_at, r.lost_reason, r.contact_email, r.contact_phone,
      ]),
    );
  } else if (kind === "clientes") {
    const verFees = can(user, "clientes:ver_fees");
    const rows = await all<Record<string, string | number | null>>(
        `SELECT c.name, c.specialty, c.plan, c.fee_cents, c.fee_currency, c.start_date,
                c.next_charge_date, c.payment_status, c.onboarding_status, c.account_health,
                c.dev_required, c.landing, c.renewal_date, c.churned_at, c.churn_reason,
                pm.name AS paid_media, st.name AS setter, c.alerts_note
         FROM clients c
         LEFT JOIN users pm ON pm.id = c.paid_media_owner_id
         LEFT JOIN users st ON st.id = c.setter_owner_id
         ORDER BY (c.churned_at IS NOT NULL), c.name`,
        [],
    );

    // El equipo no exporta lo que no puede ver en pantalla.
    const headers = ["Cliente", "Especialidad", "Plan", ...(verFees ? ["Fee", "Moneda"] : []),
      "Alta", ...(verFees ? ["Próximo cobro", "Estado de pago"] : []),
      "Onboarding", "Estado", "Desarrollo", "Landing", "Renovación", "Baja", "Motivo de baja",
      "Paid Media", "Setter", "Alertas"];

    name = "netflow-clientes";
    body = csv(
      headers,
      rows.map((r) => [
        r.name, r.specialty, r.plan,
        ...(verFees ? [money(Number(r.fee_cents)), r.fee_currency] : []),
        r.start_date,
        ...(verFees ? [r.next_charge_date, r.payment_status] : []),
        r.onboarding_status, r.account_health,
        r.dev_required === 1 ? "sí" : "no", r.landing === 1 ? "sí" : "no",
        r.renewal_date, r.churned_at, r.churn_reason, r.paid_media, r.setter, r.alerts_note,
      ]),
    );
  } else {
    return new Response("Tipo de exportación desconocido", { status: 400 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
