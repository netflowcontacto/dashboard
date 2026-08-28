import { one } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga de un adjunto.
 *
 * Exige sesión: los archivos no son públicos aunque su clave sea aleatoria.
 * Se sirve por acá y no con una URL directa al almacenamiento justamente para
 * poder verificar la sesión en cada descarga.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const row = await one<{ storage_key: string; filename: string; content_type: string }>(
    "SELECT storage_key, filename, content_type FROM attachments WHERE id = ?",
    [Number(id)],
  );
  if (!row) return new Response("No encontrado", { status: 404 });

  const data = await getFile(row.storage_key);
  if (!data) return new Response("El archivo ya no está disponible", { status: 410 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": row.content_type,
      // `inline` deja previsualizar imágenes y PDF sin descargarlos.
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.filename)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
