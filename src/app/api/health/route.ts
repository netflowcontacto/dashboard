import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chequeo de salud. Verifica que la base responde, no solo que el proceso
 * está vivo: un contenedor con la base rota no sirve para nada.
 *
 * No expone datos de negocio: solo estado y hora.
 */
export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { status: "error", detail: e instanceof Error ? e.message : "desconocido" },
      { status: 503 },
    );
  }
}
