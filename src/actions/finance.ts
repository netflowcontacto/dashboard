"use server";

import { revalidatePath } from "next/cache";
import { run, setSetting } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { clearFxCache } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";
import { errorMessage, type ActionState } from "@/lib/errors";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import * as F from "@/lib/form";

const CURRENCIES = ["ARS", "USD"] as const;

/**
 * Alta de gasto.
 *
 * Dirección puede cargar cualquier categoría. Paid Media puede cargar
 * UNICAMENTE inversión publicitaria: es su herramienta de trabajo y a la vez
 * la fuente del CPL y del CAC. No le da ninguna visibilidad sobre el resto
 * de los costos de la empresa.
 */
export async function saveExpense(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();

  const category = F.pick(fd, "category", EXPENSE_CATEGORIES, "otros");
  const fullAccess = can(user, "finanzas:cargar");
  const paidMediaOnly = can(user, "paid_media:cargar");

  if (!fullAccess && !(paidMediaOnly && category === "paid_media")) {
    return { error: "No tenes permiso para cargar este gasto." };
  }

  try {
    const concept = F.optStr(fd, "concept");
    if (!concept) return { error: "El gasto necesita un concepto." };

    const amount = parseAmountToCents(F.str(fd, "amount"));
    if (amount === null || amount <= 0) return { error: "Importe invalido." };

    const id = F.optInt(fd, "id");
    const values = [
      concept,
      category,
      amount,
      F.pick(fd, "currency", CURRENCIES, "ARS"),
      F.date(fd, "date", todayISO()),
      F.pick(fd, "cost_type", ["fijo", "variable"] as const, "variable"),
      F.pick(fd, "recurrence", ["recurrente", "no_recurrente"] as const, "no_recurrente"),
      F.str(fd, "vendor"),
      F.optInt(fd, "client_id"),
      F.bool(fd, "direct_cost"),
      F.pick(fd, "status", ["pagado", "pendiente"] as const, "pagado"),
      F.str(fd, "platform"),
      F.str(fd, "campaign"),
      F.str(fd, "notes"),
    ];

    if (id && fullAccess) {
      await run(
        `UPDATE expenses SET concept=?, category=?, amount_cents=?, currency=?, date=?, cost_type=?,
                             recurrence=?, vendor=?, client_id=?, direct_cost=?, status=?,
                             platform=?, campaign=?, notes=?
         WHERE id=?`,
        [...values, id],
      );
    } else {
      await run(
        `INSERT INTO expenses (concept, category, amount_cents, currency, date, cost_type, recurrence,
                               vendor, client_id, direct_cost, status, platform, campaign, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...values, user.id],
      );
    }

    revalidatePath("/finanzas");
    revalidatePath("/inversion");
    revalidatePath("/funnel");
    return { ok: "Gasto registrado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteExpense(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "finanzas:cargar")) return;
  const id = F.int(fd, "id");
  if (!id) return;
  await run("DELETE FROM expenses WHERE id = ?", [id]);
  revalidatePath("/finanzas");
}

/** Saldo de caja declarado a mano. Es la base del runway. */
export async function saveCashSnapshot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "finanzas:cargar")) return { error: "Solo dirección puede cargar la caja." };

  try {
    const account = F.optStr(fd, "account");
    if (!account) return { error: "Indica la cuenta." };

    const balance = parseAmountToCents(F.str(fd, "balance"));
    if (balance === null) return { error: "Saldo invalido." };

    await run(
      `INSERT INTO cash_snapshots (account, currency, balance_cents, date, notes) VALUES (?,?,?,?,?)`,
      [
        account,
        F.pick(fd, "currency", CURRENCIES, "ARS"),
        balance,
        F.date(fd, "date", todayISO()),
        F.str(fd, "notes"),
      ],
    );

    revalidatePath("/finanzas");
    revalidatePath("/resumen");
    return { ok: "Saldo de caja actualizado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Tipo de cambio de referencia y moneda base para consolidar ARS/USD. */
export async function saveFxSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "ajustes:gestionar")) return { error: "Solo dirección puede cambiar los ajustes." };

  const rate = F.num(fd, "fx_ars_per_usd", 0);
  if (rate <= 0) return { error: "El tipo de cambio tiene que ser mayor a cero." };

  await setSetting("fx_ars_per_usd", String(rate));
  await setSetting("base_currency", F.pick(fd, "base_currency", CURRENCIES, "USD"));
  clearFxCache();

  revalidatePath("/", "layout");
  return { ok: "Ajustes de moneda guardados." };
}

export async function saveOperationalSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "ajustes:gestionar")) return { error: "Solo dirección puede cambiar los ajustes." };

  await setSetting("sla_primer_contacto_horas", String(Math.max(1, F.num(fd, "sla_primer_contacto_horas", 24))));
  await setSetting("dias_follow_up_propuesta", String(Math.max(1, F.num(fd, "dias_follow_up_propuesta", 5))));
  await setSetting("paid_lead_sources", F.str(fd, "paid_lead_sources", "meta_ads,google_ads,instagram_ads,pauta"));
  await setSetting("visibilidad_equipo", F.pick(fd, "visibilidad_equipo", ["abierta", "restringida"] as const, "abierta"));

  revalidatePath("/", "layout");
  return { ok: "Ajustes operativos guardados." };
}

/** Registro de creativos y tests de paid media. */
export async function saveCampaignAsset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "paid_media:cargar") && !can(user, "finanzas:cargar")) {
    return { error: "No tenes permiso para registrar creativos." };
  }

  const name = F.optStr(fd, "name");
  if (!name) return { error: "El creativo necesita un nombre." };

  try {
    await run(
      `INSERT INTO campaign_assets (name, kind, platform, campaign, date, result, user_id, notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        name,
        F.pick(fd, "kind", ["creativo", "test"] as const, "creativo"),
        F.str(fd, "platform"),
        F.str(fd, "campaign"),
        F.date(fd, "date", todayISO()),
        F.str(fd, "result"),
        user.id,
        F.str(fd, "notes"),
      ],
    );

    revalidatePath("/inversion");
    return { ok: "Creativo registrado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
