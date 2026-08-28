"use server";

import { revalidatePath } from "next/cache";
import { one, run, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { errorMessage, type ActionState } from "@/lib/errors";
import * as F from "@/lib/form";
import { TIPOS_ACTIVIDAD, type TipoActividad } from "@/lib/actividad";

/**
 * Bitácora de actividad de una oportunidad.
 *
 * La idea es que registrar el contacto no sea una tarea aparte: cuando alguien
 * escribe por WhatsApp desde la ficha, el evento se guarda solo y, si era el
 * primer contacto, se completa `first_contacted_at`. Eso hace que el tiempo de
 * respuesta del setter se llene con el trabajo real en vez de depender de que
 * alguien se acuerde de actualizar el CRM.
 */

const DETALLE_AUTOMATICO: Record<TipoActividad, string> = {
  llamada: "Llamada iniciada desde el CRM",
  whatsapp: "Mensaje de WhatsApp iniciado desde el CRM",
  email: "Email iniciado desde el CRM",
  nota: "Nota",
  reunion: "Reunión",
};

/**
 * Registra un intento de contacto. Lo llama el botón de WhatsApp / llamar /
 * email al mismo tiempo que abre el canal.
 */
export async function registrarContacto(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return;

  const leadId = F.int(fd, "lead_id");
  const tipo = F.pick(fd, "tipo", TIPOS_ACTIVIDAD, "nota");
  if (!leadId) return;

  await tx(async (q) => {
    await q.run(
      "INSERT INTO lead_events (lead_id, type, detail, user_id) VALUES (?,?,?,?)",
      [leadId, tipo, DETALLE_AUTOMATICO[tipo], user.id],
    );

    // Si es el primer contacto, se sella acá: es lo que alimenta el % de
    // contacto del funnel y el tiempo de respuesta del setter.
    if (tipo !== "nota") {
      await q.run(
        `UPDATE leads
         SET first_contacted_at = COALESCE(first_contacted_at, nf_now()),
             stage = CASE WHEN stage = 'nuevo' THEN 'contactado' ELSE stage END,
             follow_up_count = follow_up_count + 1,
             updated_at = nf_now()
         WHERE id = ?`,
        [leadId],
      );
    }
  });

  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/crm");
}

/** Registro manual: una llamada que ya ocurrió, una nota, lo que sea. */
export async function registrarActividad(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return { error: "No tenés permiso para editar el CRM." };

  const leadId = F.int(fd, "lead_id");
  const tipo = F.pick(fd, "tipo", TIPOS_ACTIVIDAD, "nota");
  const detalle = F.optStr(fd, "detalle");
  if (!leadId) return { error: "Oportunidad inválida." };
  if (!detalle) return { error: "Contá qué pasó." };

  try {
    const nextAction = F.optStr(fd, "next_action");
    const nextDate = F.optDate(fd, "next_action_date");

    await tx(async (q) => {
      await q.run(
        "INSERT INTO lead_events (lead_id, type, detail, user_id) VALUES (?,?,?,?)",
        [leadId, tipo, detalle, user.id],
      );

      if (tipo !== "nota") {
        await q.run(
          `UPDATE leads
           SET first_contacted_at = COALESCE(first_contacted_at, nf_now()),
               stage = CASE WHEN stage = 'nuevo' THEN 'contactado' ELSE stage END,
               follow_up_count = follow_up_count + 1,
               updated_at = nf_now()
           WHERE id = ?`,
          [leadId],
        );
      }

      // Dejar la próxima acción en el mismo paso evita el estado más común
      // del CRM abandonado: actividad registrada y nada agendado después.
      if (nextAction && nextDate) {
        await q.run(
          "UPDATE leads SET next_action = ?, next_action_date = ?, updated_at = nf_now() WHERE id = ?",
          [nextAction, nextDate, leadId],
        );
      }
    });

    revalidatePath(`/crm/${leadId}`);
    revalidatePath("/crm");
    return { ok: "Actividad registrada." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Deshacer un movimiento de etapa: lo usa el aviso con "Deshacer". */
export async function revertirEtapa(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "crm:editar")) return;

  const leadId = F.int(fd, "lead_id");
  const etapa = F.str(fd, "stage");
  if (!leadId || !etapa) return;

  const actual = await one<{ stage: string }>("SELECT stage FROM leads WHERE id = ?", [leadId]);
  if (!actual) return;

  await run("UPDATE leads SET stage = ?, updated_at = nf_now() WHERE id = ?", [etapa, leadId]);
  await run(
    "INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, user_id) VALUES (?,?,?,?,?,?)",
    [leadId, "cambio_etapa", actual.stage, etapa, "Movimiento deshecho", user.id],
  );

  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
}
