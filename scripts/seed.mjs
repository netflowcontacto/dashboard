/**
 * Seed inicial de NetFlow.
 *
 * Crea el equipo, los ajustes por defecto y el objetivo general del mes
 * (5 clientes nuevos), con los objetivos derivados por area.
 *
 * NO crea datos comerciales de ejemplo: el CRM, los clientes y las finanzas
 * arrancan vacios para que los primeros números del dashboard sean reales.
 * Para cargar datos de demostracion: `npm run db:seed -- --demo`.
 *
 *   npm run db:seed
 *
 * Corre con node directamente: no necesita ningún compilador.
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const DEMO = process.argv.includes("--demo");

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "netflow.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));

const today = new Date().toISOString().slice(0, 10);
const period = today.slice(0, 7);

function hash(plain) {
  return bcrypt.hashSync(plain, 10);
}

// --- Ajustes ----------------------------------------------------------------
const settings = [
  ["fx_ars_per_usd", "1000"],
  ["base_currency", "USD"],
  ["sla_primer_contacto_horas", "24"],
  ["dias_follow_up_propuesta", "5"],
  ["paid_lead_sources", "meta_ads,google_ads,instagram_ads,pauta"],
];
const upsertSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`,
);
for (const [k, v] of settings) upsertSetting.run(k, v);

// --- Equipo -----------------------------------------------------------------
const adminEmail = (process.env.SEED_ADMIN_EMAIL || "netflow.contacto@gmail.com").toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || "netflow-cambiar-2025";

const team = [
  { name: "Leandro", email: adminEmail, role: "admin", area: "direccion", jobTitle: "Dirección / Marketing / Gestión", password: adminPassword },
  { name: "Facundo", email: "facundo@netflow.local", role: "admin", area: "closer", jobTitle: "CEO / Closer", password: adminPassword },
  { name: "Sophia", email: "sophia@netflow.local", role: "member", area: "paid_media", jobTitle: "Paid Media", password: adminPassword },
  { name: "Max", email: "max@netflow.local", role: "member", area: "setter", jobTitle: "Setter", password: adminPassword },
  { name: "Santiago", email: "santiago@netflow.local", role: "member", area: "desarrollo", jobTitle: "Desarrollo", password: adminPassword },
];

const insertUser = db.prepare(
  `INSERT INTO users (name, email, password_hash, role, area, job_title)
   VALUES (?,?,?,?,?,?)
   ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role,
                                    area = excluded.area, job_title = excluded.job_title`,
);
for (const m of team) {
  insertUser.run(m.name, m.email, hash(m.password), m.role, m.area, m.jobTitle);
}

const users = db.prepare("SELECT id, name, area FROM users").all();
const byArea = (area) => users.find((u) => u.area === area)?.id ?? null;

// --- Objetivos del mes ------------------------------------------------------
// El objetivo general es 5 clientes nuevos. Los de area son los números que
// tienen que pasar para que ese objetivo sea alcanzable, no metas sueltas.
const insertObjective = db.prepare(
  `INSERT INTO objectives (period, scope, area, user_id, metric_key, label, target_value, weight, direction)
   VALUES (?,?,?,?,?,?,?,?,?)
   ON CONFLICT(period, scope, area, user_id, metric_key) DO NOTHING`,
);

insertObjective.run(period, "empresa", null, null, "clientes_nuevos", "Clientes nuevos del mes", 5, 3, "higher_is_better");
insertObjective.run(period, "empresa", null, null, "leads_totales", "Leads generados", 100, 1, "higher_is_better");
insertObjective.run(period, "empresa", null, null, "clientes_activos", "Clientes activos", 10, 1, "higher_is_better");

const areaObjectives = [
  // area, métrica, objetivo, peso
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
  ["direccion", "piezas_publicadas", 16, 2],
  ["direccion", "cumplimiento_contenido", 90, 2],
  ["direccion", "crm_actualizado", 95, 2],
];
for (const [area, metric, target, weight] of areaObjectives) {
  insertObjective.run(period, "area", area, null, metric, "", target, weight, "higher_is_better");
}

// Objetivos individuales: espejo de los del area, para que la barra de cada
// persona tenga contra que medirse desde el día uno.
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
  ["direccion", "piezas_publicadas", 16, 2],
  ["direccion", "crm_actualizado", 95, 2],
];
for (const [area, metric, target, weight] of personObjectives) {
  const userId = byArea(area);
  if (userId) {
    insertObjective.run(period, "persona", null, userId, metric, "", target, weight, "higher_is_better");
  }
}

// Las métricas donde menos es mejor se corrigen acá (CPL, tiempo de respuesta).
db.prepare(
  `UPDATE objectives SET direction = 'lower_is_better'
   WHERE metric_key IN ('cpl','tiempo_respuesta_horas','pendientes','incidencias',
                        'procesos_abiertos','churn_clientes')`,
).run();

// --- Integraciones ----------------------------------------------------------
const insertIntegration = db.prepare(
  `INSERT INTO integrations (key, name, status, notes) VALUES (?,?,?,?)
   ON CONFLICT(key) DO NOTHING`,
);
insertIntegration.run("formularios", "Formularios y landings", "no_configurada", "V1 — endpoint generico de leads.");
insertIntegration.run("calendly", "Calendly", "no_configurada", "V2 — prioridad: reuniones sin doble carga.");
insertIntegration.run("google_calendar", "Google Calendar", "no_configurada", "V2.");
insertIntegration.run("meta_ads", "Meta Ads", "no_configurada", "V3.");
insertIntegration.run("manychat", "ManyChat", "no_configurada", "V3.");

// --- Datos de demostracion (opcional) ---------------------------------------
if (DEMO) {
  seedDemo();
}

function seedDemo() {
  const setterId = byArea("setter");
  const closerId = byArea("closer");
  const paidId = byArea("paid_media");
  const devId = byArea("desarrollo");
  const dirId = byArea("direccion");

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const stamp = (offset, hour = 15) => `${day(offset)} ${String(hour).padStart(2, "0")}:00:00`;

  const insertLead = db.prepare(
    `INSERT INTO leads (name, company, specialty, contact_email, contact_phone, source, entered_at,
       owner_id, setter_id, closer_id, stage, next_action, next_action_date,
       first_contacted_at, qualified_at, meeting_scheduled_at, meeting_at, meeting_held_at,
       meeting_outcome, proposal_sent_at, plan_interest, potential_value_cents, potential_currency,
       outcome, lost_reason, closed_at, created_at, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const demoLeads = [
    ["Dra. Paula Rivas", "Centro Dermatológico Rivas", "Dermatología", "paula@ejemplo.com", "+5491100000001", "meta_ads", day(-22), setterId, setterId, closerId, "propuesta", "Llamar para cerrar", day(1), stamp(-22, 10), stamp(-21), stamp(-20), stamp(-16), stamp(-16), "realizada", stamp(-14), "Plan Crecimiento", 90000, "USD", "open", null, null, stamp(-22, 9), ""],
    ["Dr. Nicolas Ferrer", "Odontología Ferrer", "Odontología", "nico@ejemplo.com", "+5491100000002", "meta_ads", day(-18), closerId, setterId, closerId, "reunion_realizada", "Enviar propuesta", day(0), stamp(-18, 11), stamp(-17), stamp(-15), stamp(-9), stamp(-9), "realizada", null, "Plan Inicial", 60000, "USD", "open", null, null, stamp(-18, 10), ""],
    ["Clínica Norte", "Clínica Norte", "Multiespecialidad", "info@ejemplo.com", "+5491100000003", "referido", day(-12), setterId, setterId, closerId, "reunion_agendada", "Confirmar asistencia", day(2), stamp(-12, 14), stamp(-11), stamp(-8), stamp(3), null, "agendada", null, "Plan Crecimiento", 120000, "USD", "open", null, null, stamp(-12, 13), ""],
    ["Dra. Luciana Paz", "Consultorio Paz", "Nutrición", "luciana@ejemplo.com", "+5491100000004", "instagram_ads", day(-9), setterId, setterId, null, "calificado", "Ofrecer horarios de reunión", day(1), stamp(-9, 12), stamp(-8), null, null, null, "sin_reunion", null, "", 45000, "USD", "open", null, null, stamp(-9, 11), ""],
    ["Dr. Ramiro Cano", "Traumatología Cano", "Traumatología", "ramiro@ejemplo.com", "+5491100000005", "meta_ads", day(-6), setterId, setterId, null, "contactado", "Segundo intento por WhatsApp", day(0), stamp(-5), null, null, null, null, "sin_reunion", null, "", 0, "USD", "open", null, null, stamp(-6, 9), ""],
    ["Centro Visión Sur", "Centro Visión Sur", "Oftalmología", "contacto@ejemplo.com", "", "meta_ads", day(-3), setterId, setterId, null, "nuevo", "Primer contacto", day(0), null, null, null, null, null, "sin_reunion", null, "", 0, "USD", "open", null, null, stamp(-3, 16), ""],
    ["Dr. Julian Costa", "Kinesiología Costa", "Kinesiología", "julian@ejemplo.com", "", "google_ads", day(-25), closerId, setterId, closerId, "perdido", "Sin acción", day(-5), stamp(-25, 10), stamp(-24), stamp(-23), stamp(-19), null, "no_show", null, "", 50000, "USD", "lost", "No-show repetido, no volvio a responder", stamp(-15), stamp(-25, 9), ""],
  ];
  for (const row of demoLeads) insertLead.run(...row);

  // Un cliente ganado, con su oportunidad asociada
  const clientInfo = db
    .prepare(
      `INSERT INTO clients (name, specialty, plan, fee_cents, fee_currency, start_date, next_charge_date,
         payment_status, paid_media_owner_id, setter_owner_id, dev_required, landing,
         onboarding_status, account_health, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run("Instituto Salud Integral", "Multiespecialidad", "Plan Crecimiento", 150000, "USD", day(-40), day(5),
         "al_dia", paidId, setterId, 1, 1, "completo", "bien", "Cliente de referencia.");
  const clientId = Number(clientInfo.lastInsertRowid);

  insertLead.run("Instituto Salud Integral", "Instituto Salud Integral", "Multiespecialidad",
    "admin@ejemplo.com", "", "referido", day(-55), closerId, setterId, closerId, "ganado",
    "Seguimiento de cuenta", day(7), stamp(-54), stamp(-53), stamp(-52), stamp(-48), stamp(-48),
    "realizada", stamp(-45), "Plan Crecimiento", 150000, "USD", "won", null, stamp(-40), stamp(-55), "");
  db.prepare("UPDATE leads SET client_id = ? WHERE name = ? AND outcome = 'won'").run(clientId, "Instituto Salud Integral");

  db.prepare(
    `INSERT INTO invoices (client_id, period, concept, amount_cents, currency, issued_at, due_at, status, paid_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(clientId, period, "Fee mensual", 150000, "USD", day(-5), day(5), "cobrada", day(-2));

  const insertExpense = db.prepare(
    `INSERT INTO expenses (concept, category, amount_cents, currency, date, cost_type, recurrence,
       vendor, client_id, direct_cost, status, platform, campaign)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insertExpense.run("Campaña Meta - captación", "paid_media", 60000, "USD", day(-20), "variable", "recurrente", "Meta", null, 0, "pagado", "meta", "captacion-agosto");
  insertExpense.run("Campaña Meta - remarketing", "paid_media", 25000, "USD", day(-8), "variable", "recurrente", "Meta", null, 0, "pagado", "meta", "remarketing");
  insertExpense.run("Hosting y dominios", "infraestructura", 4500, "USD", day(-15), "fijo", "recurrente", "Vercel", null, 0, "pagado", "", "");
  insertExpense.run("Suite de software", "software", 9000, "USD", day(-15), "fijo", "recurrente", "Varios", null, 0, "pagado", "", "");
  insertExpense.run("Gestión de campañas cliente", "desarrollo", 20000, "USD", day(-10), "variable", "no_recurrente", "Equipo", clientId, 1, "pagado", "", "");
  insertExpense.run("Contador", "contable", 60000, "ARS", day(-12), "fijo", "recurrente", "Estudio contable", null, 0, "pagado", "", "");

  db.prepare(
    "INSERT INTO cash_snapshots (account, currency, balance_cents, date, notes) VALUES (?,?,?,?,?)",
  ).run("Cuenta USD", "USD", 1_200_000, day(-1), "Saldo declarado");
  db.prepare(
    "INSERT INTO cash_snapshots (account, currency, balance_cents, date, notes) VALUES (?,?,?,?,?)",
  ).run("Cuenta ARS", "ARS", 8_000_000, day(-1), "Saldo declarado");

  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, category, assignee_id, client_id, status, priority,
       due_date, done_at, blocker, channel, planned_date, published_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insertTask.run("Landing Instituto Salud Integral", "", "landing", devId, clientId, "hecho", "alta", day(-30), day(-31), "", "", null, null);
  insertTask.run("Automatización de reportes", "", "proyecto", devId, null, "en_curso", "media", day(6), null, "", "", null, null);
  insertTask.run("Corrección de formulario", "", "correccion", devId, clientId, "pendiente", "alta", day(-1), null, "", "", null, null);
  insertTask.run("Post caso de éxito", "", "contenido", dirId, null, "hecho", "media", day(-4), day(-4), "", "linkedin_netflow", day(-4), day(-4));
  insertTask.run("Post metodo NetFlow", "", "contenido", dirId, null, "pendiente", "media", day(3), null, "", "linkedin_facundo", day(3), null);
  insertTask.run("Documentar proceso de setting", "", "proceso", dirId, null, "en_curso", "media", day(10), null, "", "", null, null);

  db.prepare(
    "INSERT INTO campaign_assets (name, kind, platform, campaign, date, result, user_id) VALUES (?,?,?,?,?,?,?)",
  ).run("Video testimonial v1", "creativo", "meta", "captacion-agosto", day(-18), "CPL 14 USD", paidId);
  db.prepare(
    "INSERT INTO campaign_assets (name, kind, platform, campaign, date, result, user_id) VALUES (?,?,?,?,?,?,?)",
  ).run("Test de titular", "test", "meta", "captacion-agosto", day(-11), "Gano la variante B", paidId);

  db.prepare(
    "INSERT INTO announcements (title, body, level, author_id, starts_at) VALUES (?,?,?,?,?)",
  ).run("Reunión de equipo los lunes 10 h", "Revisamos objetivos del mes y cuello de botella.", "info", dirId, day(-2));
}

const counts = {
  usuarios: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
  objetivos: db.prepare("SELECT COUNT(*) AS n FROM objectives").get().n,
  oportunidades: db.prepare("SELECT COUNT(*) AS n FROM leads").get().n,
  clientes: db.prepare("SELECT COUNT(*) AS n FROM clients").get().n,
};

console.log(`Base lista en ${dbPath}`);
console.log(`  usuarios:      ${counts.usuarios}`);
console.log(`  objetivos:     ${counts.objetivos}`);
console.log(`  oportunidades: ${counts.oportunidades}`);
console.log(`  clientes:      ${counts.clientes}`);
console.log("");
console.log(`Ingresar con: ${adminEmail}`);
if (!process.env.SEED_ADMIN_PASSWORD) {
  console.log(`Contraseña por defecto: ${adminPassword}  <-- cambiarla en Ajustes después del primer login`);
}
if (!DEMO) {
  console.log("");
  console.log("Sin datos de ejemplo. Para cargarlos: npm run db:seed -- --demo");
}

db.close();
