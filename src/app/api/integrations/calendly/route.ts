import { NextResponse } from "next/server";
import {
  applyInboundLead, markProcessed, recordEvent, touchIntegration, verifyCalendlySignature,
} from "@/lib/integrations";
import { run } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Calendly. Es la prioridad de la V2: una reunión agendada por Max
 * tiene que reflejarse sola en el CRM, sin cargarla dos veces.
 *
 * Eventos soportados: invitee.created (reunión agendada) e invitee.canceled.
 * La firma se valida siempre; sin signing key configurada el endpoint responde
 * 503 en vez de aceptar cualquier cosa.
 */
export async function POST(request: Request) {
  if (!process.env.CALENDLY_WEBHOOK_SIGNING_KEY) {
    return NextResponse.json(
      { error: "Integración no configurada. Definir CALENDLY_WEBHOOK_SIGNING_KEY." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  if (!verifyCalendlySignature(raw, request.headers.get("calendly-webhook-signature"))) {
    return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
  }

  let body: {
    event?: string;
    payload?: {
      uri?: string;
      email?: string;
      name?: string;
      text_reminder_number?: string;
      scheduled_event?: { start_time?: string; end_time?: string; name?: string };
      questions_and_answers?: { question: string; answer: string }[];
    };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const eventType = body.event ?? "desconocido";
  const externalId = body.payload?.uri ?? null;

  const eventId = await recordEvent("calendly", externalId, eventType, body);
  if (eventId === null) {
    return NextResponse.json({ ok: true, duplicated: true });
  }

  try {
    if (eventType === "invitee.canceled") {
      const updated = externalId
        ? await run(
            `UPDATE leads SET meeting_outcome = 'cancelada', updated_at = nf_now()
             WHERE id = (SELECT lead_id FROM integration_events
                         WHERE source = 'calendly' AND external_id = ? AND lead_id IS NOT NULL
                         ORDER BY id DESC LIMIT 1)`,
            [externalId],
          )
        : 0;
      await markProcessed(eventId, updated ? "reunion_cancelada" : "sin_coincidencia", null);
      await touchIntegration("calendly", "activa");
      return NextResponse.json({ ok: true });
    }

    const startTime = body.payload?.scheduled_event?.start_time;
    const name = body.payload?.name ?? body.payload?.email ?? "Invitado de Calendly";

    const result = await applyInboundLead({
      name,
      email: body.payload?.email,
      phone: body.payload?.text_reminder_number,
      source: "calendly",
      notes: (body.payload?.questions_and_answers ?? [])
        .map((qa) => `${qa.question}: ${qa.answer}`)
        .join("\n"),
      meetingAt: startTime ? startTime.slice(0, 19).replace("T", " ") : null,
    });

    // Espejo en la tabla de reuniones, para el calendario.
    if (startTime) {
      await run(
        `INSERT INTO meetings (title, lead_id, starts_at, ends_at, status, source, external_id)
         VALUES (?,?,?,?, 'agendada', 'calendly', ?)`,
        [
          body.payload?.scheduled_event?.name ?? "Reunión",
          result.leadId,
          startTime.slice(0, 19).replace("T", " "),
          body.payload?.scheduled_event?.end_time?.slice(0, 19).replace("T", " ") ?? null,
          externalId,
        ],
      );
    }

    await markProcessed(eventId, result.created ? "lead_creado" : "reunion_agendada", result.leadId);
    await touchIntegration("calendly", "activa");

    return NextResponse.json({ ok: true, lead_id: result.leadId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    await markProcessed(eventId, `error: ${message}`, null);
    await touchIntegration("calendly", "error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
