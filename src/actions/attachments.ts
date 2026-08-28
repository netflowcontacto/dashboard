"use server";

import { revalidatePath } from "next/cache";
import { all, one, insert, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { errorMessage, type ActionState } from "@/lib/errors";
import { deleteFile, isAllowedType, newStorageKey, putFile, MAX_FILE_BYTES } from "@/lib/storage";

export type AttachTo = "lead" | "client" | "task";

export interface AttachmentRow {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by_name: string | null;
}

const COLUMN: Record<AttachTo, string> = {
  lead: "lead_id",
  client: "client_id",
  task: "task_id",
};

export async function listAttachments(kind: AttachTo, ownerId: number): Promise<AttachmentRow[]> {
  return all<AttachmentRow>(
    `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.created_at, u.name AS uploaded_by_name
     FROM attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.${COLUMN[kind]} = ?
     ORDER BY a.id DESC`,
    [ownerId],
  );
}

/**
 * Subida de un adjunto.
 *
 * El archivo va al almacenamiento de objetos con una clave aleatoria; en la
 * base queda la referencia. El nombre original se guarda solo para mostrarlo,
 * nunca para armar una ruta.
 */
export async function uploadAttachment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "archivos:subir")) return { error: "No tenés permiso para adjuntar archivos." };

  const kind = String(fd.get("kind") ?? "") as AttachTo;
  const ownerId = Number(fd.get("owner_id"));
  if (!COLUMN[kind] || !Number.isInteger(ownerId)) return { error: "Destino del archivo inválido." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo." };

  if (file.size > MAX_FILE_BYTES) {
    return { error: `El archivo supera el máximo de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.` };
  }
  const contentType = file.type || "application/octet-stream";
  if (!isAllowedType(contentType)) {
    return { error: `Tipo de archivo no permitido (${contentType}).` };
  }

  try {
    const key = newStorageKey(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putFile(key, buffer, contentType);

    await insert(
      `INSERT INTO attachments (${COLUMN[kind]}, filename, content_type, size_bytes, storage_key, uploaded_by)
       VALUES (?,?,?,?,?,?) RETURNING id`,
      [ownerId, file.name.slice(0, 200), contentType, file.size, key, user.id],
    );

    revalidatePathFor(kind, ownerId);
    return { ok: `"${file.name}" adjuntado.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function removeAttachment(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "archivos:subir")) return;

  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;

  const row = await one<{ storage_key: string; lead_id: number | null; client_id: number | null; task_id: number | null }>(
    "SELECT storage_key, lead_id, client_id, task_id FROM attachments WHERE id = ?",
    [id],
  );
  if (!row) return;

  await run("DELETE FROM attachments WHERE id = ?", [id]);
  await deleteFile(row.storage_key);

  if (row.lead_id) revalidatePathFor("lead", row.lead_id);
  if (row.client_id) revalidatePathFor("client", row.client_id);
  if (row.task_id) revalidatePathFor("task", row.task_id);
}

function revalidatePathFor(kind: AttachTo, ownerId: number): void {
  if (kind === "lead") revalidatePath(`/crm/${ownerId}`);
  else if (kind === "client") revalidatePath(`/clientes/${ownerId}`);
  else revalidatePath("/tareas");
}
