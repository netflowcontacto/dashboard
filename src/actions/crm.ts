"use server";

import { revalidatePath } from "next/cache";
import { all, one, run, insert, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { nowStamp, todayISO } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";
import * as F from "@/lib/form";
import { errorMessage, type ActionState } from "@/lib/errors";
import { STAGES, type Stage } from "@/lib/types";

const CURRENCIES = ["ARS", "USD"] as const;
const OUTCOMES = ["open", "won", "lost"] as const;

/**
 * Al avanzar de etapa se completan hacia atrás las marcas de tiempo que
 * falten. Sin esto el funnel deja de ser monotono (un lead "en propuesta"
 * sin fecha de contacto haría que Propuestas > Contactados) y los
 * porcentajes de conversión pasan de 100%.
 */
function backfillTimestamps(stage: Stage, current: Record<string, unknown>, now: string) {
  const idx = STAGES.indexOf(stage);
  const at = (key: string) => (current[key] as string | null) ?? null;
  const out: Record<string, string | null> = {};

  const reached = (s: Stage) => idx >= STAGES.indexOf(s) && stage !== "perdido";

  if (reached("contactado") && !at("first_contacted_at")) out.first_contacted_at = now;
  if (reached("calificado") && !at("qualified_at")) out.qualified_at = now;
  if (reached("reunion_agendada") && !at("meeting_scheduled_at")) out.meeting_scheduled_at = now;
  if (reached("reunion_realizada") && !at("meeting_held_at")) out.meeting_held_at = now;
  if (reached("propuesta") && !at("proposal_sent_at")) out.proposal_sent_at = now;

  // Perdido: se preserva lo que ya habia ocurrido; no se inventa nada.
  return out;
}

export async function createLead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return { error: "No tenes permiso para editar el CRM." };

  try {
    const name = F.requireField(F.optStr(fd, "name"), "nombre");
    const ownerId = F.optInt(fd, "owner_id");
    if (!ownerId) return { error: "Toda oportunidad necesita un responsable." };

    const nextAction = F.optStr(fd, "next_action");
    const nextActionDate = F.optDate(fd, "next_action_date");
    if (!nextAction || !nextActionDate) {
      return { error: "Toda oportunidad abierta necesita próxima acción y fecha." };
    }

    const stage = F.pick<Stage>(fd, "stage", STAGES, "nuevo");
    const now = nowStamp();

    const leadId = await insert(
      `INSERT INTO leads (
         name, company, specialty, contact_email, contact_phone, source, entered_at,
         owner_id, setter_id, closer_id, stage, next_action, next_action_date,
         plan_interest, potential_value_cents, potential_currency, notes
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [
        name,
        F.str(fd, "company"),
        F.str(fd, "specialty"),
        F.str(fd, "contact_email"),
        F.str(fd, "contact_phone"),
        F.str(fd, "source", "otro") || "otro",
        F.date(fd, "entered_at", todayISO()),
        ownerId,
        F.optInt(fd, "setter_id"),
        F.optInt(fd, "closer_id"),
        stage,
        nextAction,
        nextActionDate,
        F.str(fd, "plan_interest"),
        parseAmountToCents(F.str(fd, "potential_value")) ?? 0,
        F.pick(fd, "potential_currency", CURRENCIES, "USD"),
        F.str(fd, "notes"),
      ],
    );

    await applyTimestamps(leadId, backfillTimestamps(stage, {}, now));
    await run(
      `INSERT INTO lead_events (lead_id, type, to_stage, detail, user_id) VALUES (?,?,?,?,?)`,
      [leadId, "cambio_etapa", stage, "Alta de la oportunidad", user.id],
    );

    revalidatePath("/crm");
    return { ok: "Oportunidad creada." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

async function applyTimestamps(
  leadId: number,
  timestamps: Record<string, string | null>,
  q?: { run(sql: string, params?: unknown[]): Promise<number> },
) {
  const keys = Object.keys(timestamps);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const sql = `UPDATE leads SET ${sets} WHERE id = ?`;
  const params = [...keys.map((k) => timestamps[k]), leadId];
  if (q) await q.run(sql, params);
  else await run(sql, params);
}

export async function updateLead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return { error: "No tenes permiso para editar el CRM." };

  const id = F.int(fd, "id");
  if (!id) return { error: "Oportunidad invalida." };

  try {
    const current = await one<Record<string, unknown>>("SELECT * FROM leads WHERE id = ?", [id]);
    if (!current) return { error: "La oportunidad no existe." };

    const outcome = F.pick(fd, "outcome", OUTCOMES, "open");
    const stage = F.pick<Stage>(fd, "stage", STAGES, current.stage as Stage);
    const nextAction = F.optStr(fd, "next_action");
    const nextActionDate = F.optDate(fd, "next_action_date");
    const lostReason = F.optStr(fd, "lost_reason");
    const ownerId = F.optInt(fd, "owner_id");

    if (!ownerId) return { error: "Toda oportunidad necesita un responsable." };
    if (outcome === "open" && (!nextAction || !nextActionDate)) {
      return { error: "Una oportunidad abierta no puede quedar sin próxima acción y fecha." };
    }
    if (outcome === "lost" && !lostReason) {
      return { error: "Para dar por perdida una oportunidad hay que indicar el motivo." };
    }

    const now = nowStamp();
    const closedAt =
      outcome === "open" ? null : ((current.closed_at as string | null) ?? now);

    await tx(async (q) => {
      await q.run(
        `UPDATE leads SET
           name = ?, company = ?, specialty = ?, contact_email = ?, contact_phone = ?,
           source = ?, entered_at = ?, owner_id = ?, setter_id = ?, closer_id = ?,
           stage = ?, next_action = ?, next_action_date = ?,
           meeting_scheduled_at = ?, meeting_at = ?, meeting_held_at = ?, meeting_outcome = ?,
           no_show_count = ?, recovered_from_noshow = ?,
           plan_interest = ?, potential_value_cents = ?, potential_currency = ?,
           proposal_sent_at = ?, outcome = ?, lost_reason = ?, closed_at = ?,
           notes = ?, updated_at = nf_now()
         WHERE id = ?`,
        [
        F.str(fd, "name", String(current.name)),
        F.str(fd, "company"),
        F.str(fd, "specialty"),
        F.str(fd, "contact_email"),
        F.str(fd, "contact_phone"),
        F.str(fd, "source", "otro") || "otro",
        F.date(fd, "entered_at", String(current.entered_at)),
        ownerId,
        F.optInt(fd, "setter_id"),
        F.optInt(fd, "closer_id"),
        stage,
        outcome === "open" ? nextAction : nextAction,
        outcome === "open" ? nextActionDate : nextActionDate,
        F.optDateTime(fd, "meeting_scheduled_at") ?? (current.meeting_scheduled_at as string | null),
        F.optDateTime(fd, "meeting_at"),
        F.optDateTime(fd, "meeting_held_at") ?? (current.meeting_held_at as string | null),
        F.pick(
          fd,
          "meeting_outcome",
          ["sin_reunion", "agendada", "realizada", "no_show", "reprogramada", "cancelada"] as const,
          "sin_reunion",
        ),
        F.int(fd, "no_show_count", Number(current.no_show_count ?? 0)),
        F.bool(fd, "recovered_from_noshow"),
        F.str(fd, "plan_interest"),
        parseAmountToCents(F.str(fd, "potential_value")) ?? Number(current.potential_value_cents ?? 0),
        F.pick(fd, "potential_currency", CURRENCIES, "USD"),
        F.optDateTime(fd, "proposal_sent_at") ?? (current.proposal_sent_at as string | null),
        outcome,
        outcome === "lost" ? lostReason : null,
        closedAt,
          F.str(fd, "notes"),
          id,
        ],
      );

      await applyTimestamps(id, backfillTimestamps(stage, current, now), q);

      if (current.stage !== stage) {
        await q.run(
          `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, user_id)
           VALUES (?,?,?,?,?,?)`,
          [id, "cambio_etapa", current.stage, stage, "", user.id],
        );
      }
    });

    revalidatePath("/crm");
    revalidatePath(`/crm/${id}`);
    return { ok: "Oportunidad actualizada." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Mueve una oportunidad de etapa desde el pipeline, sin abrir la ficha. */
export async function moveStage(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return;

  const id = F.int(fd, "id");
  const stage = F.pick<Stage>(fd, "stage", STAGES, "nuevo");
  if (!id) return;

  const current = await one<Record<string, unknown>>("SELECT * FROM leads WHERE id = ?", [id]);
  if (!current) return;

  // Ganado y perdido se cierran desde la ficha: necesitan cliente o motivo.
  if (stage === "ganado" || stage === "perdido") return;

  const now = nowStamp();
  await tx(async (q) => {
    await q.run("UPDATE leads SET stage = ?, updated_at = nf_now() WHERE id = ?", [stage, id]);
    await applyTimestamps(id, backfillTimestamps(stage, current, now), q);
    await q.run(
      `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, user_id) VALUES (?,?,?,?,?)`,
      [id, "cambio_etapa", current.stage, stage, user.id],
    );
  });

  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
}

/**
 * Cierra la oportunidad como ganada y da de alta el cliente en un solo paso.
 * Así no existe el caso "lead ganado sin cliente cargado", que rompe el CAC
 * y el MRR nuevo.
 */
export async function closeWon(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return { error: "No tenes permiso para editar el CRM." };

  const id = F.int(fd, "id");
  if (!id) return { error: "Oportunidad invalida." };

  try {
    const lead = await one<Record<string, unknown>>("SELECT * FROM leads WHERE id = ?", [id]);
    if (!lead) return { error: "La oportunidad no existe." };

    const feeCents = parseAmountToCents(F.str(fd, "fee"));
    if (feeCents === null || feeCents <= 0) return { error: "Indica el fee mensual del cliente." };

    const startDate = F.date(fd, "start_date", todayISO());
    const now = nowStamp();

    await tx(async (q) => {
      const clientId = await q.insert(
        `INSERT INTO clients (
           name, specialty, plan, fee_cents, fee_currency, start_date, next_charge_date,
           paid_media_owner_id, setter_owner_id, dev_required, landing, onboarding_status, notes
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        [
          F.str(fd, "client_name") || String(lead.company || lead.name),
          String(lead.specialty ?? ""),
          F.str(fd, "plan") || String(lead.plan_interest ?? ""),
          feeCents,
          F.pick(fd, "fee_currency", CURRENCIES, "USD"),
          startDate,
          F.optDate(fd, "next_charge_date"),
          F.optInt(fd, "paid_media_owner_id"),
          (lead.setter_id as number | null) ?? null,
          F.bool(fd, "dev_required"),
          F.bool(fd, "landing"),
          "pendiente",
          `Alta desde la oportunidad #${id}.`,
        ],
      );

      await q.run(
        `UPDATE leads SET outcome = 'won', stage = 'ganado', closed_at = ?, client_id = ?,
                          lost_reason = NULL, updated_at = nf_now()
         WHERE id = ?`,
        [now, clientId, id],
      );

      await applyTimestamps(id, backfillTimestamps("propuesta", lead, now), q);

      await q.run(
        `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, user_id)
         VALUES (?,?,?,?,?,?)`,
        [id, "cambio_etapa", lead.stage, "ganado", "Cliente dado de alta", user.id],
      );
    });

    revalidatePath("/crm");
    revalidatePath("/clientes");
    revalidatePath(`/crm/${id}`);
    return { ok: "Cliente creado y oportunidad cerrada." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function closeLost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return { error: "No tenes permiso para editar el CRM." };

  const id = F.int(fd, "id");
  const reason = F.optStr(fd, "lost_reason");
  if (!id) return { error: "Oportunidad invalida." };
  if (!reason) return { error: "Indica el motivo de pérdida." };

  try {
    await tx(async (q) => {
      const lead = await q.one<{ stage: string }>("SELECT stage FROM leads WHERE id = ?", [id]);
      await q.run(
        `UPDATE leads SET outcome = 'lost', stage = 'perdido', lost_reason = ?, closed_at = ?,
                          updated_at = nf_now()
         WHERE id = ?`,
        [reason, nowStamp(), id],
      );
      await q.run(
        `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, user_id)
         VALUES (?,?,?,?,?,?)`,
        [id, "cambio_etapa", lead?.stage ?? null, "perdido", reason, user.id],
      );
    });

    revalidatePath("/crm");
    revalidatePath(`/crm/${id}`);
    return { ok: "Oportunidad cerrada como perdida." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function reopenLead(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return;
  const id = F.int(fd, "id");
  const nextAction = F.str(fd, "next_action") || "Retomar contacto";
  const nextDate = F.optDate(fd, "next_action_date") ?? todayISO();
  if (!id) return;

  await run(
    `UPDATE leads SET outcome = 'open', stage = 'follow_up', lost_reason = NULL, closed_at = NULL,
                      next_action = ?, next_action_date = ?, updated_at = nf_now()
     WHERE id = ?`,
    [nextAction, nextDate, id],
  );

  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
}
