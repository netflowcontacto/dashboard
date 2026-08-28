import { NextResponse } from "next/server";
import {
  applyInboundLead, markProcessed, recordEvent, touchIntegration, verifyInboundToken,
} from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint generico de leads entrantes (formularios, landings, ManyChat).
 *
 * POST /api/integrations/leads
 * Header: X-NetFlow-Token: <INTEGRATIONS_INBOUND_TOKEN>
 * Body JSON: { name, email?, phone?, company?, specialty?, source?, notes?, meeting_at?, external_id? }
 *
 * Si INTEGRATIONS_INBOUND_TOKEN no esta configurado, el endpoint responde 503:
 * cerrado por defecto, nunca abierto.
 */
export async function POST(request: Request) {
  if (!process.env.INTEGRATIONS_INBOUND_TOKEN) {
    return NextResponse.json(
      { error: "Integracion no configurada. Definir INTEGRATIONS_INBOUND_TOKEN." },
      { status: 503 },
    );
  }
  if (!verifyInboundToken(request)) {
    return NextResponse.json({ error: "Token invalido." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const name = String(payload.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Falta el campo 'name'." }, { status: 400 });
  }

  const source = String(payload.source ?? "form").trim() || "form";
  const externalId = payload.external_id ? String(payload.external_id) : null;

  const eventId = recordEvent(source, externalId, "lead.created", payload);
  if (eventId === null) {
    return NextResponse.json({ ok: true, duplicated: true }, { status: 200 });
  }

  try {
    const result = applyInboundLead({
      name,
      email: payload.email ? String(payload.email) : undefined,
      phone: payload.phone ? String(payload.phone) : undefined,
      company: payload.company ? String(payload.company) : undefined,
      specialty: payload.specialty ? String(payload.specialty) : undefined,
      source,
      notes: payload.notes ? String(payload.notes) : undefined,
      meetingAt: payload.meeting_at ? String(payload.meeting_at) : null,
    });

    markProcessed(eventId, result.created ? "lead_creado" : "lead_actualizado", result.leadId);
    touchIntegration(source === "manychat" ? "manychat" : "formularios", "activa");

    return NextResponse.json({ ok: true, lead_id: result.leadId, created: result.created });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    markProcessed(eventId, `error: ${message}`, null);
    touchIntegration(source === "manychat" ? "manychat" : "formularios", "error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
