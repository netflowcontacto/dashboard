import "server-only";
import crypto from "node:crypto";
import { getDb } from "./db";
import { todayISO } from "./dates";

/**
 * Capa de integraciones.
 *
 * Criterio (V1): la arquitectura queda lista, pero NADA depende de ella.
 * Si una integración no esta configurada, la carga sigue siendo manual y el
 * dashboard funciona igual. Nunca frenamos la primera versión por automatizar.
 *
 * Como funciona el camino de entrada, único para todas las fuentes:
 *
 *   webhook  ->  se guarda el payload crudo en integration_events
 *            ->  se normaliza a una "reunión" o a un "lead"
 *            ->  se aplica sobre el CRM (crear o actualizar)
 *
 * Guardar el crudo primero permite reprocesar sin pedirle nada al proveedor
 * cuando cambia el mapeo, y auditar que llego exactamente.
 */

export interface IntegrationDef {
  key: string;
  name: string;
  phase: "V1" | "V2" | "V3";
  description: string;
  /** Que resuelve concretamente cuando este activa. */
  value: string;
  /** Como se conecta. */
  setup: string;
  envVars: string[];
  inboundPath?: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "formularios",
    name: "Formularios y landings",
    phase: "V1",
    description: "Endpoint generico para que cualquier formulario cree la oportunidad en el CRM.",
    value: "Un lead cargado en la web aparece en el CRM sin copiarlo a mano.",
    setup:
      "Configurar el formulario para hacer POST a /api/integrations/leads con el header X-NetFlow-Token.",
    envVars: ["INTEGRATIONS_INBOUND_TOKEN"],
    inboundPath: "/api/integrations/leads",
  },
  {
    key: "calendly",
    name: "Calendly",
    phase: "V2",
    description: "Webhook de reuniones agendadas, canceladas y no-show.",
    value:
      "Prioridad de la V2: una reunión que agenda Max en Calendly se refleja sola en el CRM, sin cargarla dos veces.",
    setup:
      "Crear un webhook en Calendly apuntando a /api/integrations/calendly con los eventos invitee.created e invitee.canceled, y guardar la signing key.",
    envVars: ["CALENDLY_WEBHOOK_SIGNING_KEY"],
    inboundPath: "/api/integrations/calendly",
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    phase: "V2",
    description: "Sincronización de agenda del equipo.",
    value: "El calendario del dashboard muestra la agenda real, no solo lo cargado a mano.",
    setup: "Alta de credenciales OAuth en Google Cloud y autorización por persona.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  },
  {
    key: "meta_ads",
    name: "Meta Ads",
    phase: "V3",
    description: "Inversión, impresiones y leads por campaña.",
    value: "La inversión deja de cargarse a mano y el CPL se actualiza solo.",
    setup: "Token de sistema con permiso ads_read sobre la cuenta publicitaria.",
    envVars: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
  },
  {
    key: "manychat",
    name: "ManyChat",
    phase: "V3",
    description: "Leads conversacionales de Instagram y WhatsApp.",
    value: "Las conversaciones que califican entran directo al pipeline.",
    setup: "External Request de ManyChat hacia /api/integrations/leads con origen manychat.",
    envVars: ["INTEGRATIONS_INBOUND_TOKEN"],
    inboundPath: "/api/integrations/leads",
  },
];

export function integrationStatuses() {
  const rows = getDb().prepare("SELECT * FROM integrations").all() as {
    key: string; status: string; last_sync_at: string | null; last_error: string; notes: string;
  }[];
  const stored = new Map(rows.map((r) => [r.key, r]));

  return INTEGRATIONS.map((def) => {
    const configured = def.envVars.every((v) => Boolean(process.env[v]));
    const row = stored.get(def.key);
    return {
      ...def,
      configured,
      status: row?.status ?? (configured ? "configurada" : "no_configurada"),
      lastSyncAt: row?.last_sync_at ?? null,
      lastError: row?.last_error ?? "",
      eventCount: eventCount(def.key),
    };
  });
}

function eventCount(source: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM integration_events WHERE source = ?")
    .get(source) as { n: number };
  return row.n;
}

/** Verifica el token compartido de los webhooks entrantes. */
export function verifyInboundToken(request: Request): boolean {
  const expected = process.env.INTEGRATIONS_INBOUND_TOKEN;
  if (!expected) return false; // sin token configurado, el endpoint queda cerrado
  const received = request.headers.get("x-netflow-token") ?? "";
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verifica la firma HMAC de Calendly (header Calendly-Webhook-Signature). */
export function verifyCalendlySignature(rawBody: string, header: string | null): boolean {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key || !header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const expected = crypto.createHmac("sha256", key).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Guarda el payload crudo. Devuelve null si ya lo habiamos recibido. */
export function recordEvent(
  source: string,
  externalId: string | null,
  eventType: string,
  payload: unknown,
): number | null {
  try {
    const info = getDb()
      .prepare(
        `INSERT INTO integration_events (source, external_id, event_type, payload_json)
         VALUES (?,?,?,?)`,
      )
      .run(source, externalId, eventType, JSON.stringify(payload));
    return Number(info.lastInsertRowid);
  } catch {
    return null; // UNIQUE(source, external_id): evento duplicado, ya procesado
  }
}

export function markProcessed(eventId: number, result: string, leadId: number | null): void {
  getDb()
    .prepare(
      "UPDATE integration_events SET processed_at = datetime('now'), result = ?, lead_id = ? WHERE id = ?",
    )
    .run(result, leadId, eventId);
}

export function touchIntegration(key: string, status: string, error = ""): void {
  const def = INTEGRATIONS.find((i) => i.key === key);
  getDb()
    .prepare(
      `INSERT INTO integrations (key, name, status, last_sync_at, last_error, updated_at)
       VALUES (?,?,?,datetime('now'),?,datetime('now'))
       ON CONFLICT(key) DO UPDATE SET status = excluded.status,
                                      last_sync_at = excluded.last_sync_at,
                                      last_error = excluded.last_error,
                                      updated_at = datetime('now')`,
    )
    .run(key, def?.name ?? key, status, error);
}

export interface InboundLead {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  specialty?: string;
  source: string;
  notes?: string;
  meetingAt?: string | null;
  externalId?: string | null;
}

/**
 * Aplica un lead entrante sobre el CRM.
 *
 * Si ya existe una oportunidad abierta con ese email o teléfono, se actualiza
 * en lugar de duplicar: en una agencia chica los mismos contactos vuelven a
 * entrar por varios canales, y el CRM duplicado es lo que hace que se
 * abandone.
 */
export function applyInboundLead(input: InboundLead): { leadId: number; created: boolean } {
  const db = getDb();

  const defaultOwner = db
    .prepare(
      `SELECT id FROM users WHERE active = 1 AND area = 'setter'
       UNION ALL SELECT id FROM users WHERE active = 1 AND role = 'admin'
       LIMIT 1`,
    )
    .get() as { id: number } | undefined;

  if (!defaultOwner) throw new Error("No hay usuarios activos para asignar el lead.");

  const existing =
    input.email || input.phone
      ? (db
          .prepare(
            `SELECT id FROM leads
             WHERE outcome = 'open'
               AND ((? <> '' AND contact_email = ?) OR (? <> '' AND contact_phone = ?))
             ORDER BY id DESC LIMIT 1`,
          )
          .get(input.email ?? "", input.email ?? "", input.phone ?? "", input.phone ?? "") as
          | { id: number }
          | undefined)
      : undefined;

  const today = todayISO();

  if (existing) {
    if (input.meetingAt) {
      db.prepare(
        `UPDATE leads SET meeting_at = ?, meeting_scheduled_at = COALESCE(meeting_scheduled_at, datetime('now')),
                          meeting_outcome = 'agendada',
                          stage = CASE WHEN stage IN ('nuevo','contactado','calificado') THEN 'reunion_agendada' ELSE stage END,
                          next_action = 'Preparar la reunión',
                          next_action_date = ?,
                          updated_at = datetime('now')
         WHERE id = ?`,
      ).run(input.meetingAt, input.meetingAt.slice(0, 10), existing.id);
    }
    db.prepare(
      `INSERT INTO lead_events (lead_id, type, detail) VALUES (?, 'integración', ?)`,
    ).run(existing.id, `Actualizado desde ${input.source}`);
    return { leadId: existing.id, created: false };
  }

  const info = db
    .prepare(
      `INSERT INTO leads (
         name, company, specialty, contact_email, contact_phone, source, entered_at,
         owner_id, setter_id, stage, next_action, next_action_date,
         meeting_at, meeting_scheduled_at, meeting_outcome, notes
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.name,
      input.company ?? "",
      input.specialty ?? "",
      input.email ?? "",
      input.phone ?? "",
      input.source,
      today,
      defaultOwner.id,
      defaultOwner.id,
      input.meetingAt ? "reunion_agendada" : "nuevo",
      input.meetingAt ? "Preparar la reunión" : "Primer contacto",
      input.meetingAt ? input.meetingAt.slice(0, 10) : today,
      input.meetingAt ?? null,
      input.meetingAt ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
      input.meetingAt ? "agendada" : "sin_reunion",
      input.notes ?? "",
    );

  const leadId = Number(info.lastInsertRowid);
  getDb()
    .prepare(`INSERT INTO lead_events (lead_id, type, to_stage, detail) VALUES (?, 'integración', ?, ?)`)
    .run(leadId, input.meetingAt ? "reunion_agendada" : "nuevo", `Alta automática desde ${input.source}`);

  return { leadId, created: true };
}
