/**
 * Seed inicial de NetFlow (PostgreSQL).
 *
 * Crea el equipo, los ajustes por defecto y el objetivo general del mes
 * (5 clientes nuevos), con los objetivos derivados por área.
 *
 * NO crea datos comerciales de ejemplo: el CRM, los clientes y las finanzas
 * arrancan vacíos para que los primeros números del dashboard sean reales.
 * Para cargar datos de demostración: `npm run db:seed -- --demo`.
 *
 *   DATABASE_URL=postgres://... npm run db:seed
 *
 * Corre con node directamente: no necesita ningún compilador.
 */
import pg from "pg";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const DEMO = process.argv.includes("--demo");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL. Ejemplo:");
  console.error("  DATABASE_URL=postgres://usuario:clave@host/netflow npm run db:seed");
  process.exit(1);
}

/** Misma regla de TLS que la aplicación (ver src/lib/pgssl.ts). */
function sslFor(u) {
  const lower = u.toLowerCase();
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("sslmode=require") || lower.includes("sslmode=verify")) {
    return { rejectUnauthorized: false };
  }
  if (lower.includes("host=/") || lower.startsWith("postgres:///")) return false;
  try {
    const host = new URL(u).hostname;
    if (!host || ["localhost", "127.0.0.1", "::1", "postgres"].includes(host)) return false;
  } catch {
    /* URL no parseable: se asume remota */
  }
  return { rejectUnauthorized: false };
}

const pool = new pg.Pool({ connectionString: url, ssl: sslFor(url) });

/** Traduce los `?` posicionales al formato `$1..$n` de PostgreSQL. */
function toPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const run = (sql, params = []) => pool.query(toPlaceholders(sql), params);
const all = async (sql, params = []) => (await pool.query(toPlaceholders(sql), params)).rows;
const one = async (sql, params = []) => (await pool.query(toPlaceholders(sql), params)).rows[0];

await pool.query(fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));

const today = new Date().toISOString().slice(0, 10);
const period = today.slice(0, 7);
const hash = (plain) => bcrypt.hashSync(plain, 10);

// --- Ajustes ----------------------------------------------------------------
const settings = [
  ["fx_ars_per_usd", "1000"],
  ["base_currency", "USD"],
  ["sla_primer_contacto_horas", "24"],
  ["dias_follow_up_propuesta", "5"],
  ["paid_lead_sources", "meta_ads,google_ads,instagram_ads,pauta"],
  // Todo el equipo ve la operación completa. La facturación es de Dirección.
  ["visibilidad_equipo", "abierta"],
];
for (const [k, v] of settings) {
  await run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING", [k, v]);
}

// --- Equipo -----------------------------------------------------------------
//
// Una sola cuenta de administración: es la única que ve facturación, caja y
// márgenes, y la única que puede cargar gastos, objetivos y usuarios.
// Las otras cinco personas ven exactamente lo mismo entre sí.
const adminEmail = (process.env.SEED_ADMIN_EMAIL || "netflow.contacto@gmail.com").toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || "netflow-cambiar-2026";

const team = [
  { name: "Administración", email: adminEmail, role: "admin", area: "direccion", jobTitle: "Dirección" },
  { name: "Facundo", email: "facundo@netflow.local", role: "member", area: "closer", jobTitle: "CEO / Closer" },
  { name: "Leandro", email: "leandro@netflow.local", role: "member", area: "marketing", jobTitle: "Marketing y contenido" },
  { name: "Sophia", email: "sophia@netflow.local", role: "member", area: "paid_media", jobTitle: "Paid Media" },
  { name: "Max", email: "max@netflow.local", role: "member", area: "setter", jobTitle: "Setter" },
  { name: "Santiago", email: "santiago@netflow.local", role: "member", area: "desarrollo", jobTitle: "Desarrollo" },
];

for (const m of team) {
  await run(
    `INSERT INTO users (name, email, password_hash, role, area, job_title)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
                                       area = EXCLUDED.area, job_title = EXCLUDED.job_title`,
    [m.name, m.email, hash(adminPassword), m.role, m.area, m.jobTitle],
  );
}

const users = await all("SELECT id, name, area FROM users");
const byArea = (area) => users.find((u) => u.area === area)?.id ?? null;

// --- Objetivos del mes ------------------------------------------------------
// El objetivo general es 5 clientes nuevos. Los de área son los números que
// tienen que pasar para que ese objetivo sea alcanzable, no metas sueltas.
async function objective(scope, area, userId, metric, target, weight) {
  await run(
    `INSERT INTO objectives (period, scope, area, user_id, metric_key, label, target_value, weight, direction)
     VALUES (?,?,?,?,?,'',?,?,?)
     ON CONFLICT (period, scope, area, user_id, metric_key) DO NOTHING`,
    [period, scope, area, userId, metric, target, weight, "higher_is_better"],
  );
}

await objective("empresa", null, null, "clientes_nuevos", 5, 3);
await objective("empresa", null, null, "leads_totales", 100, 1);
await objective("empresa", null, null, "clientes_activos", 10, 1);

const areaObjectives = [
  ["closer", "reuniones_realizadas", 20, 2],
  ["closer", "propuestas", 12, 1],
  ["closer", "cierres", 5, 3],
  ["closer", "close_rate", 25, 1],
  ["setter", "leads_contactados", 100, 2],
  ["setter", "reuniones_agendadas", 25, 3],
  ["setter", "show_rate", 80, 2],
  ["setter", "tiempo_respuesta_horas", 4, 1],
  ["paid_media", "leads_pauta", 100, 2],
  ["paid_media", "cpl", 15, 2],
  ["paid_media", "creativos_tests", 12, 1],
  ["desarrollo", "proyectos_terminados", 4, 2],
  ["desarrollo", "entregas_a_tiempo", 90, 2],
  ["marketing", "piezas_publicadas", 16, 2],
  ["marketing", "cumplimiento_contenido", 90, 2],
  ["direccion", "crm_actualizado", 95, 2],
];
for (const [area, metric, target, weight] of areaObjectives) {
  await objective("area", area, null, metric, target, weight);
}

// Objetivos individuales: espejo de los del área, para que la barra de cada
// persona tenga contra qué medirse desde el día uno.
const personObjectives = [
  ["closer", "reuniones_realizadas", 20, 2],
  ["closer", "cierres", 5, 3],
  ["closer", "close_rate", 25, 1],
  ["setter", "reuniones_agendadas", 25, 3],
  ["setter", "leads_contactados", 100, 2],
  ["setter", "show_rate", 80, 2],
  ["paid_media", "leads_pauta", 100, 2],
  ["paid_media", "cpl", 15, 2],
  ["paid_media", "creativos_tests", 12, 1],
  ["desarrollo", "proyectos_terminados", 4, 2],
  ["desarrollo", "entregas_a_tiempo", 90, 2],
  ["marketing", "piezas_publicadas", 16, 2],
  ["marketing", "cumplimiento_contenido", 90, 2],
];
for (const [area, metric, target, weight] of personObjectives) {
  const userId = byArea(area);
  if (userId) await objective("persona", null, userId, metric, target, weight);
}

// Las métricas donde menos es mejor se corrigen acá (CPL, tiempo de respuesta).
await run(
  `UPDATE objectives SET direction = 'lower_is_better'
   WHERE metric_key IN ('cpl','tiempo_respuesta_horas','pendientes','incidencias',
                        'procesos_abiertos','churn_clientes')`,
);

// --- Integraciones ----------------------------------------------------------
const integrations = [
  ["formularios", "Formularios y landings", "V1 — endpoint genérico de leads."],
  ["calendly", "Calendly", "V2 — prioridad: reuniones sin doble carga."],
  ["google_calendar", "Google Calendar", "V2."],
  ["meta_ads", "Meta Ads", "V3."],
  ["manychat", "ManyChat", "V3."],
];
for (const [key, name, notes] of integrations) {
  await run(
    "INSERT INTO integrations (key, name, status, notes) VALUES (?,?,'no_configurada',?) ON CONFLICT (key) DO NOTHING",
    [key, name, notes],
  );
}

// --- Datos de demostración (opcional) ---------------------------------------
if (DEMO) await seedDemo();

async function seedDemo() {
  const setterId = byArea("setter");
  const closerId = byArea("closer");
  const paidId = byArea("paid_media");
  const devId = byArea("desarrollo");
  const mktId = byArea("marketing");

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const stamp = (offset, hour = 15) => `${day(offset)} ${String(hour).padStart(2, "0")}:00:00`;

  const insertLead = `
    INSERT INTO leads (name, company, specialty, contact_email, contact_phone, source, entered_at,
      owner_id, setter_id, closer_id, stage, next_action, next_action_date,
      first_contacted_at, qualified_at, meeting_scheduled_at, meeting_at, meeting_held_at,
      meeting_outcome, proposal_sent_at, plan_interest, potential_value_cents, potential_currency,
      outcome, lost_reason, closed_at, created_at, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`;

  const demoLeads = [
    ["Dra. Paula Rivas", "Centro Dermatológico Rivas", "Dermatología", "paula@ejemplo.com", "+5491100000001", "meta_ads", day(-22), setterId, setterId, closerId, "propuesta", "Llamar para cerrar", day(1), stamp(-22, 10), stamp(-21), stamp(-20), stamp(-16), stamp(-16), "realizada", stamp(-14), "Plan Crecimiento", 90000, "USD", "open", null, null, stamp(-22, 9), ""],
    ["Dr. Nicolás Ferrer", "Odontología Ferrer", "Odontología", "nico@ejemplo.com", "+5491100000002", "meta_ads", day(-18), closerId, setterId, closerId, "reunion_realizada", "Enviar propuesta", day(0), stamp(-18, 11), stamp(-17), stamp(-15), stamp(-9), stamp(-9), "realizada", null, "Plan Inicial", 60000, "USD", "open", null, null, stamp(-18, 10), ""],
    ["Clínica Norte", "Clínica Norte", "Multiespecialidad", "info@ejemplo.com", "+5491100000003", "referido", day(-12), setterId, setterId, closerId, "reunion_agendada", "Confirmar asistencia", day(2), stamp(-12, 14), stamp(-11), stamp(-8), stamp(3), null, "agendada", null, "Plan Crecimiento", 120000, "USD", "open", null, null, stamp(-12, 13), ""],
    ["Dra. Luciana Paz", "Consultorio Paz", "Nutrición", "luciana@ejemplo.com", "+5491100000004", "instagram_ads", day(-9), setterId, setterId, null, "calificado", "Ofrecer horarios de reunión", day(1), stamp(-9, 12), stamp(-8), null, null, null, "sin_reunion", null, "", 45000, "USD", "open", null, null, stamp(-9, 11), ""],
    ["Dr. Ramiro Cano", "Traumatología Cano", "Traumatología", "ramiro@ejemplo.com", "+5491100000005", "meta_ads", day(-6), setterId, setterId, null, "contactado", "Segundo intento por WhatsApp", day(0), stamp(-5), null, null, null, null, "sin_reunion", null, "", 0, "USD", "open", null, null, stamp(-6, 9), ""],
    ["Centro Visión Sur", "Centro Visión Sur", "Oftalmología", "contacto@ejemplo.com", "", "meta_ads", day(-3), setterId, setterId, null, "nuevo", "Primer contacto", day(0), null, null, null, null, null, "sin_reunion", null, "", 0, "USD", "open", null, null, stamp(-3, 16), ""],
    ["Dr. Julián Costa", "Kinesiología Costa", "Kinesiología", "julian@ejemplo.com", "", "google_ads", day(-25), closerId, setterId, closerId, "perdido", "Sin acción", day(-5), stamp(-25, 10), stamp(-24), stamp(-23), stamp(-19), null, "no_show", null, "", 50000, "USD", "lost", "No-show repetido, no volvió a responder", stamp(-15), stamp(-25, 9), ""],
  ];
  for (const row of demoLeads) await run(insertLead, row);

  // Un cliente ganado, con su oportunidad asociada
  const client = await one(
    `INSERT INTO clients (name, specialty, plan, fee_cents, fee_currency, start_date, next_charge_date,
       payment_status, paid_media_owner_id, setter_owner_id, dev_required, landing,
       onboarding_status, account_health, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ["Instituto Salud Integral", "Multiespecialidad", "Plan Crecimiento", 150000, "USD", day(-40), day(5),
     "al_dia", paidId, setterId, 1, 1, "completo", "bien", "Cliente de referencia."],
  );
  const clientId = client.id;

  await run(insertLead, ["Instituto Salud Integral", "Instituto Salud Integral", "Multiespecialidad",
    "admin@ejemplo.com", "", "referido", day(-55), closerId, setterId, closerId, "ganado",
    "Seguimiento de cuenta", day(7), stamp(-54), stamp(-53), stamp(-52), stamp(-48), stamp(-48),
    "realizada", stamp(-45), "Plan Crecimiento", 150000, "USD", "won", null, stamp(-40), stamp(-55), ""]);
  await run("UPDATE leads SET client_id = ? WHERE name = ? AND outcome = 'won'",
    [clientId, "Instituto Salud Integral"]);

  await run(
    `INSERT INTO invoices (client_id, period, concept, amount_cents, currency, issued_at, due_at, status, paid_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [clientId, period, "Fee mensual", 150000, "USD", day(-5), day(5), "cobrada", day(-2)],
  );

  const insertExpense = `
    INSERT INTO expenses (concept, category, amount_cents, currency, date, cost_type, recurrence,
      vendor, client_id, direct_cost, status, platform, campaign)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const expenses = [
    ["Campaña Meta - captación", "paid_media", 60000, "USD", day(-20), "variable", "recurrente", "Meta", null, 0, "pagado", "meta", "captacion-agosto"],
    ["Campaña Meta - remarketing", "paid_media", 25000, "USD", day(-8), "variable", "recurrente", "Meta", null, 0, "pagado", "meta", "remarketing"],
    ["Hosting y dominios", "infraestructura", 4500, "USD", day(-15), "fijo", "recurrente", "Vercel", null, 0, "pagado", "", ""],
    ["Suite de software", "software", 9000, "USD", day(-15), "fijo", "recurrente", "Varios", null, 0, "pagado", "", ""],
    ["Gestión de campañas cliente", "desarrollo", 20000, "USD", day(-10), "variable", "no_recurrente", "Equipo", clientId, 1, "pagado", "", ""],
    ["Contador", "contable", 6000000, "ARS", day(-12), "fijo", "recurrente", "Estudio contable", null, 0, "pagado", "", ""],
  ];
  for (const e of expenses) await run(insertExpense, e);

  await run("INSERT INTO cash_snapshots (account, currency, balance_cents, date, notes) VALUES (?,?,?,?,?)",
    ["Cuenta USD", "USD", 1_200_000, day(-1), "Saldo declarado"]);
  await run("INSERT INTO cash_snapshots (account, currency, balance_cents, date, notes) VALUES (?,?,?,?,?)",
    ["Cuenta ARS", "ARS", 800_000_000, day(-1), "Saldo declarado"]);

  const insertTask = `
    INSERT INTO tasks (title, description, category, assignee_id, client_id, status, priority,
      due_date, done_at, blocker, channel, planned_date, published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const tasks = [
    ["Landing Instituto Salud Integral", "", "landing", devId, clientId, "hecho", "alta", day(-30), day(-31), "", "", null, null],
    ["Automatización de reportes", "", "proyecto", devId, null, "en_curso", "media", day(6), null, "", "", null, null],
    ["Corrección de formulario", "", "correccion", devId, clientId, "pendiente", "alta", day(-1), null, "", "", null, null],
    ["Post caso de éxito", "", "contenido", mktId, null, "hecho", "media", day(-4), day(-4), "", "linkedin_netflow", day(-4), day(-4)],
    ["Post método NetFlow", "", "contenido", mktId, null, "pendiente", "media", day(3), null, "", "linkedin_facundo", day(3), null],
    ["Documentar proceso de setting", "", "proceso", mktId, null, "en_curso", "media", day(10), null, "", "", null, null],
  ];
  for (const t of tasks) await run(insertTask, t);

  await run(
    "INSERT INTO campaign_assets (name, kind, platform, campaign, date, result, user_id) VALUES (?,?,?,?,?,?,?)",
    ["Video testimonial v1", "creativo", "meta", "captacion-agosto", day(-18), "CPL 14 USD", paidId],
  );
  await run(
    "INSERT INTO campaign_assets (name, kind, platform, campaign, date, result, user_id) VALUES (?,?,?,?,?,?,?)",
    ["Test de titular", "test", "meta", "captacion-agosto", day(-11), "Ganó la variante B", paidId],
  );

  await run(
    "INSERT INTO announcements (title, body, level, author_id, starts_at) VALUES (?,?,?,?,?)",
    ["Reunión de equipo los lunes 10 h", "Revisamos objetivos del mes y cuello de botella.", "info", mktId, day(-2)],
  );
}

const counts = await one(`
  SELECT (SELECT COUNT(*) FROM users)      AS usuarios,
         (SELECT COUNT(*) FROM objectives) AS objetivos,
         (SELECT COUNT(*) FROM leads)      AS oportunidades,
         (SELECT COUNT(*) FROM clients)    AS clientes`);

console.log("Base lista.");
console.log(`  usuarios:      ${counts.usuarios}`);
console.log(`  objetivos:     ${counts.objetivos}`);
console.log(`  oportunidades: ${counts.oportunidades}`);
console.log(`  clientes:      ${counts.clientes}`);
console.log("");
console.log(`Administración (única cuenta con acceso a facturación): ${adminEmail}`);
console.log("Equipo: facundo@ · leandro@ · sophia@ · max@ · santiago@netflow.local");
if (!process.env.SEED_ADMIN_PASSWORD) {
  console.log(`Contraseña inicial de todas las cuentas: ${adminPassword}`);
  console.log("  <-- cambiarlas desde Ajustes después del primer ingreso");
}
if (!DEMO) {
  console.log("");
  console.log("Sin datos de ejemplo. Para cargarlos: npm run db:seed -- --demo");
}

await pool.end();
