"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";
import { errorMessage, type ActionState } from "@/lib/errors";
import * as F from "@/lib/form";

const CURRENCIES = ["ARS", "USD"] as const;
const PAYMENT = ["al_dia", "pendiente", "vencido"] as const;
const ONBOARDING = ["pendiente", "en_curso", "completo"] as const;
const HEALTH = ["bien", "atencion", "riesgo"] as const;

export async function saveClient(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  // Editar la ficha comercial de un cliente (fee, cobro) es informacion
  // sensible: solo direccion.
  if (!can(user, "clientes:ver_fees")) {
    return { error: "No tenes permiso para editar la ficha comercial del cliente." };
  }

  const id = F.optInt(fd, "id");

  try {
    const name = F.optStr(fd, "name");
    if (!name) return { error: "El cliente necesita un nombre." };

    const churnedAt = F.optDate(fd, "churned_at");
    const churnReason = F.optStr(fd, "churn_reason");
    if (churnedAt && !churnReason) {
      return { error: "Para dar de baja un cliente hay que indicar el motivo." };
    }

    const values = [
      name,
      F.str(fd, "specialty"),
      F.str(fd, "plan"),
      parseAmountToCents(F.str(fd, "fee")) ?? 0,
      F.pick(fd, "fee_currency", CURRENCIES, "USD"),
      F.date(fd, "start_date", todayISO()),
      F.optDate(fd, "next_charge_date"),
      F.pick(fd, "payment_status", PAYMENT, "al_dia"),
      F.optInt(fd, "paid_media_owner_id"),
      F.optInt(fd, "setter_owner_id"),
      F.bool(fd, "dev_required"),
      F.bool(fd, "landing"),
      F.pick(fd, "onboarding_status", ONBOARDING, "pendiente"),
      F.pick(fd, "account_health", HEALTH, "bien"),
      F.str(fd, "alerts_note"),
      F.optDate(fd, "renewal_date"),
      churnedAt,
      churnReason,
      F.str(fd, "notes"),
    ];

    const db = getDb();
    if (id) {
      db.prepare(
        `UPDATE clients SET
           name=?, specialty=?, plan=?, fee_cents=?, fee_currency=?, start_date=?, next_charge_date=?,
           payment_status=?, paid_media_owner_id=?, setter_owner_id=?, dev_required=?, landing=?,
           onboarding_status=?, account_health=?, alerts_note=?, renewal_date=?, churned_at=?,
           churn_reason=?, notes=?, updated_at=datetime('now')
         WHERE id=?`,
      ).run(...values, id);
      revalidatePath(`/clientes/${id}`);
    } else {
      db.prepare(
        `INSERT INTO clients (
           name, specialty, plan, fee_cents, fee_currency, start_date, next_charge_date,
           payment_status, paid_media_owner_id, setter_owner_id, dev_required, landing,
           onboarding_status, account_health, alerts_note, renewal_date, churned_at, churn_reason, notes
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(...values);
    }

    revalidatePath("/clientes");
    revalidatePath("/resumen");
    return { ok: "Cliente guardado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/**
 * El semaforo y el estado de onboarding los puede mover cualquiera del equipo:
 * son informacion operativa, no financiera. Es lo que mantiene la ficha viva.
 */
export async function setAccountHealth(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "clientes:ver")) return;

  const id = F.int(fd, "id");
  if (!id) return;

  getDb()
    .prepare(
      `UPDATE clients SET account_health = ?, alerts_note = ?, onboarding_status = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      F.pick(fd, "account_health", HEALTH, "bien"),
      F.str(fd, "alerts_note"),
      F.pick(fd, "onboarding_status", ONBOARDING, "pendiente"),
      id,
    );

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}

export async function saveInvoice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "finanzas:cargar")) return { error: "Solo direccion puede cargar facturacion." };

  try {
    const clientId = F.optInt(fd, "client_id");
    if (!clientId) return { error: "Elegi el cliente." };

    const amount = parseAmountToCents(F.str(fd, "amount"));
    if (amount === null || amount <= 0) return { error: "Importe invalido." };

    const status = F.pick(fd, "status", ["pendiente", "cobrada", "incobrable"] as const, "pendiente");
    const issuedAt = F.date(fd, "issued_at", todayISO());
    const paidAt = status === "cobrada" ? (F.optDate(fd, "paid_at") ?? todayISO()) : null;

    getDb()
      .prepare(
        `INSERT INTO invoices (client_id, period, concept, amount_cents, currency, issued_at, due_at, status, paid_at, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        clientId,
        F.str(fd, "period") || issuedAt.slice(0, 7),
        F.str(fd, "concept") || "Fee mensual",
        amount,
        F.pick(fd, "currency", CURRENCIES, "USD"),
        issuedAt,
        F.optDate(fd, "due_at"),
        status,
        paidAt,
        F.str(fd, "notes"),
      );

    revalidatePath("/finanzas");
    revalidatePath(`/clientes/${clientId}`);
    return { ok: "Factura registrada." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function markInvoicePaid(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "finanzas:cargar")) return;
  const id = F.int(fd, "id");
  if (!id) return;

  getDb()
    .prepare("UPDATE invoices SET status = 'cobrada', paid_at = ? WHERE id = ?")
    .run(F.optDate(fd, "paid_at") ?? todayISO(), id);

  revalidatePath("/finanzas");
  revalidatePath("/clientes");
}
