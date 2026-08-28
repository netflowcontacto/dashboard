import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Almacenamiento de archivos adjuntos.
 *
 * El binario NO va a la base: va al almacenamiento de objetos y en Postgres
 * queda solo la referencia. Meter archivos en la base infla los respaldos y
 * hace lenta cada consulta de la tabla.
 *
 * Dos motores, misma interfaz:
 *   - Netlify Blobs cuando corre en Netlify (el disco de las funciones es
 *     efímero: un archivo escrito ahí desaparece).
 *   - Disco local en cualquier otro lado (desarrollo, VPS con volumen).
 */

const MAX_BYTES = 15 * 1024 * 1024;

/** Tipos permitidos. Lista blanca a propósito: nada de ejecutables. */
const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.ms-excel",
  "application/zip",
]);

export const MAX_FILE_BYTES = MAX_BYTES;

export function isAllowedType(contentType: string): boolean {
  return ALLOWED.has(contentType);
}

export function describeLimits(): string {
  return "Hasta 15 MB. Imágenes, PDF, Word, Excel, PowerPoint, CSV, texto y ZIP.";
}

function onNetlify(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
}

function localDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads");
}

/** Clave única e imposible de adivinar. Nunca se usa el nombre original. */
export function newStorageKey(filename: string): string {
  const ext = path.extname(filename).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  return `${crypto.randomBytes(16).toString("hex")}${ext}`;
}

async function blobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("netflow-adjuntos");
}

export async function putFile(key: string, data: Buffer, contentType: string): Promise<void> {
  if (data.byteLength > MAX_BYTES) {
    throw new Error(`El archivo supera el máximo de ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
  }

  if (onNetlify()) {
    const store = await blobStore();
    // Netlify Blobs espera ArrayBuffer/Blob, no el Buffer de Node.
    const view = new Uint8Array(data);
    await store.set(key, view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength), {
      metadata: { contentType },
    });
    return;
  }

  const dir = localDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, key), data);
}

export async function getFile(key: string): Promise<Buffer | null> {
  // La clave viene de la base, pero se valida igual: nunca se arma una ruta
  // de disco con algo que pueda contener "..".
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) return null;

  if (onNetlify()) {
    const store = await blobStore();
    const data = await store.get(key, { type: "arrayBuffer" });
    return data ? Buffer.from(data as ArrayBuffer) : null;
  }

  try {
    return await fs.readFile(path.join(localDir(), key));
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) return;

  if (onNetlify()) {
    const store = await blobStore();
    await store.delete(key);
    return;
  }

  try {
    await fs.unlink(path.join(localDir(), key));
  } catch {
    /* ya no estaba: no es un error */
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
