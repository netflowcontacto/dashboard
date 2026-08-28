"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { monthOf, todayISO } from "@/lib/dates";
import { findMetric } from "@/lib/metrics/registry";
import { errorMessage, type ActionState } from "@/lib/errors";
import * as F from "@/lib/form";
import type { Area } from "@/lib/types";

const AREAS = ["direccion", "closer", "paid_media", "setter", "desarrollo", "marketing"] as const;
const SCOPES = ["empresa", "area", "persona"] as const;

export async function saveObjective(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "objetivos:cargar")) return { error: "Solo dirección puede cargar objetivos." };

  try {
    const scope = F.pick(fd, "scope", SCOPES, "empresa");
    const metricKey = F.str(fd, "metric_key");
    const def = findMetric(metricKey);
    if (!def) return { error: "Elegi una métrica valida." };

    const target = F.num(fd, "target_value", 0);
    if (target <= 0) return { error: "El objetivo tiene que ser mayor a cero." };

    const period = F.str(fd, "period") || monthOf(todayISO());
    if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Período invalido (formato AAAA-MM)." };

    // El scope tiene que ser coherente: la base lo valida igual, pero acá
    // damos un mensaje entendible antes de llegar al CHECK.
    const area: Area | null = scope === "area" ? F.pick(fd, "area", AREAS, "closer") : null;
    const userId = scope === "persona" ? F.optInt(fd, "user_id") : null;
    if (scope === "area" && !area) return { error: "Elegi el area del objetivo." };
    if (scope === "persona" && !userId) return { error: "Elegi la persona del objetivo." };

    await run(
      `INSERT INTO objectives (period, scope, area, user_id, metric_key, label, target_value, weight, direction, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (period, scope, area, user_id, metric_key)
       DO UPDATE SET target_value = EXCLUDED.target_value,
                     weight       = EXCLUDED.weight,
                     label        = EXCLUDED.label,
                     direction    = EXCLUDED.direction,
                     notes        = EXCLUDED.notes`,
      [
        period,
        scope,
        area,
        userId,
        metricKey,
        F.str(fd, "label") || def.label,
        target,
        Math.max(0.1, F.num(fd, "weight", 1)),
        def.higherIsBetter ? "higher_is_better" : "lower_is_better",
        F.str(fd, "notes"),
      ],
    );

    revalidatePath("/objetivos");
    revalidatePath("/resumen");
    revalidatePath("/mi-panel");
    revalidatePath("/equipo");
    return { ok: "Objetivo guardado." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteObjective(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "objetivos:cargar")) return;
  const id = F.int(fd, "id");
  if (!id) return;
  await run("DELETE FROM objectives WHERE id = ?", [id]);
  revalidatePath("/objetivos");
  revalidatePath("/equipo");
}

/**
 * Copia los objetivos de un período al siguiente. Cargar objetivos mes a mes
 * a mano es el motivo mas comun por el que un dashboard se abandona.
 */
export async function copyObjectives(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "objetivos:cargar")) return;

  const from = F.str(fd, "from_period");
  const to = F.str(fd, "to_period");
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from === to) return;

  await run(
    `INSERT INTO objectives (period, scope, area, user_id, metric_key, label, target_value, weight, direction, notes)
     SELECT ?, scope, area, user_id, metric_key, label, target_value, weight, direction, notes
     FROM objectives WHERE period = ?
     ON CONFLICT (period, scope, area, user_id, metric_key) DO NOTHING`,
    [to, from],
  );

  revalidatePath("/objetivos");
}
