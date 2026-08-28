-- ============================================================================
-- NetFlow - Centro de control interno
-- Esquema PostgreSQL.
--
-- Decisiones que explican por qué el esquema se ve así:
--
--  * El dinero se guarda en centavos (INTEGER) + moneda. Nunca en float, y
--    nunca convertido: el valor original no se pisa jamás.
--  * Las fechas y marcas de tiempo se guardan como TEXT en formato
--    'YYYY-MM-DD' y 'YYYY-MM-DD HH:MI:SS'. Es deliberado: ordenan y comparan
--    igual que un timestamp, y todo el motor de métricas filtra por rangos de
--    texto sin depender de la zona horaria del servidor.
--  * Las reglas de negocio son CHECK, no validaciones de formulario: una
--    validación de UI se saltea con un script, un CHECK no.
-- ============================================================================

-- Marca de tiempo en el formato de texto que usa toda la aplicación.
CREATE OR REPLACE FUNCTION nf_now() RETURNS TEXT AS $$
  SELECT to_char(now() AT TIME ZONE COALESCE(
    current_setting('netflow.tz', true), 'America/Argentina/Buenos_Aires'
  ), 'YYYY-MM-DD HH24:MI:SS');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION nf_today() RETURNS TEXT AS $$
  SELECT substr(nf_now(), 1, 10);
$$ LANGUAGE SQL STABLE;

-- ---------------------------------------------------------------------------
-- Usuarios y configuración
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  area          TEXT NOT NULL CHECK (area IN (
                  'direccion','closer','paid_media','setter','desarrollo','marketing')),
  job_title     TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT nf_now()
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT nf_now()
);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                 TEXT NOT NULL,
  specialty            TEXT NOT NULL DEFAULT '',
  plan                 TEXT NOT NULL DEFAULT '',
  fee_cents            INTEGER NOT NULL DEFAULT 0,
  fee_currency         TEXT NOT NULL DEFAULT 'USD' CHECK (fee_currency IN ('ARS','USD')),

  start_date           TEXT NOT NULL,
  next_charge_date     TEXT,
  payment_status       TEXT NOT NULL DEFAULT 'al_dia' CHECK (payment_status IN ('al_dia','pendiente','vencido')),

  paid_media_owner_id  INTEGER REFERENCES users(id),
  setter_owner_id      INTEGER REFERENCES users(id),

  dev_required         INTEGER NOT NULL DEFAULT 0 CHECK (dev_required IN (0,1)),
  landing              INTEGER NOT NULL DEFAULT 0 CHECK (landing IN (0,1)),
  onboarding_status    TEXT NOT NULL DEFAULT 'pendiente' CHECK (onboarding_status IN (
                         'pendiente','en_curso','completo')),

  account_health       TEXT NOT NULL DEFAULT 'bien' CHECK (account_health IN ('bien','atencion','riesgo')),
  alerts_note          TEXT NOT NULL DEFAULT '',

  renewal_date         TEXT,
  churned_at           TEXT,
  churn_reason         TEXT,

  notes                TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL DEFAULT nf_now(),
  updated_at           TEXT NOT NULL DEFAULT nf_now(),

  CONSTRAINT baja_necesita_motivo CHECK (
    churned_at IS NULL OR (churn_reason IS NOT NULL AND trim(churn_reason) <> '')
  )
);
CREATE INDEX IF NOT EXISTS idx_clients_start   ON clients(start_date);
CREATE INDEX IF NOT EXISTS idx_clients_churned ON clients(churned_at);

-- ---------------------------------------------------------------------------
-- CRM: oportunidades
--
-- Reglas garantizadas por la base, no solo por la UI:
--   * toda oportunidad tiene responsable (owner_id NOT NULL)
--   * ninguna oportunidad abierta queda sin próxima acción + fecha
--   * ninguna oportunidad perdida queda sin motivo de pérdida
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                  TEXT NOT NULL,
  company               TEXT NOT NULL DEFAULT '',
  specialty             TEXT NOT NULL DEFAULT '',
  contact_email         TEXT NOT NULL DEFAULT '',
  contact_phone         TEXT NOT NULL DEFAULT '',
  source                TEXT NOT NULL DEFAULT 'otro',

  entered_at            TEXT NOT NULL,

  owner_id              INTEGER NOT NULL REFERENCES users(id),
  setter_id             INTEGER REFERENCES users(id),
  closer_id             INTEGER REFERENCES users(id),

  stage                 TEXT NOT NULL DEFAULT 'nuevo' CHECK (stage IN (
                          'nuevo','contactado','calificado','reunion_agendada',
                          'reunion_realizada','propuesta','follow_up','ganado','perdido')),

  next_action           TEXT,
  next_action_date      TEXT,

  meeting_scheduled_at  TEXT,
  meeting_at            TEXT,
  meeting_held_at       TEXT,
  meeting_outcome       TEXT NOT NULL DEFAULT 'sin_reunion' CHECK (meeting_outcome IN (
                          'sin_reunion','agendada','realizada','no_show','reprogramada','cancelada')),
  no_show_count         INTEGER NOT NULL DEFAULT 0,
  recovered_from_noshow INTEGER NOT NULL DEFAULT 0 CHECK (recovered_from_noshow IN (0,1)),
  follow_up_count       INTEGER NOT NULL DEFAULT 0,

  plan_interest         TEXT NOT NULL DEFAULT '',
  potential_value_cents INTEGER NOT NULL DEFAULT 0,
  potential_currency    TEXT NOT NULL DEFAULT 'USD' CHECK (potential_currency IN ('ARS','USD')),

  first_contacted_at    TEXT,
  qualified_at          TEXT,
  proposal_sent_at      TEXT,
  closed_at             TEXT,

  outcome               TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','won','lost')),
  lost_reason           TEXT,
  notes                 TEXT NOT NULL DEFAULT '',

  client_id             INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT nf_now(),
  updated_at            TEXT NOT NULL DEFAULT nf_now(),

  CONSTRAINT lead_abierto_necesita_proxima_accion CHECK (
    outcome <> 'open'
    OR (next_action IS NOT NULL AND trim(next_action) <> ''
        AND next_action_date IS NOT NULL AND trim(next_action_date) <> '')
  ),
  CONSTRAINT lead_perdido_necesita_motivo CHECK (
    outcome <> 'lost' OR (lost_reason IS NOT NULL AND trim(lost_reason) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_leads_stage       ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_owner       ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_setter      ON leads(setter_id);
CREATE INDEX IF NOT EXISTS idx_leads_closer      ON leads(closer_id);
CREATE INDEX IF NOT EXISTS idx_leads_entered     ON leads(entered_at);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_date);

-- Bitácora del embudo: cada movimiento queda registrado
CREATE TABLE IF NOT EXISTS lead_events (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  from_stage TEXT,
  to_stage   TEXT,
  detail     TEXT NOT NULL DEFAULT '',
  user_id    INTEGER REFERENCES users(id),
  at         TEXT NOT NULL DEFAULT nf_now()
);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_at   ON lead_events(at);

-- ---------------------------------------------------------------------------
-- Facturación
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,
  concept      TEXT NOT NULL DEFAULT 'Fee mensual',
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('ARS','USD')),
  issued_at    TEXT NOT NULL,
  due_at       TEXT,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','cobrada','incobrable')),
  paid_at      TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT nf_now(),

  CONSTRAINT cobrada_necesita_fecha CHECK (status <> 'cobrada' OR paid_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ---------------------------------------------------------------------------
-- Gastos
--
-- Fuente única de verdad. La inversión publicitaria NO vive en otra tabla:
-- es category = 'paid_media'. Así el funnel y las finanzas nunca se
-- contradicen ni se duplica el número.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concept      TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN (
                 'paid_media','personal_equipo','software','desarrollo','marketing_contenido',
                 'legal','contable','infraestructura','comisiones','bonos','otros')),
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS','USD')),
  date         TEXT NOT NULL,
  cost_type    TEXT NOT NULL DEFAULT 'variable' CHECK (cost_type IN ('fijo','variable')),
  recurrence   TEXT NOT NULL DEFAULT 'no_recurrente' CHECK (recurrence IN ('recurrente','no_recurrente')),
  vendor       TEXT NOT NULL DEFAULT '',
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  direct_cost  INTEGER NOT NULL DEFAULT 0 CHECK (direct_cost IN (0,1)),
  status       TEXT NOT NULL DEFAULT 'pagado' CHECK (status IN ('pagado','pendiente')),

  platform     TEXT NOT NULL DEFAULT '',
  campaign     TEXT NOT NULL DEFAULT '',

  notes        TEXT NOT NULL DEFAULT '',
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT nf_now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_client   ON expenses(client_id);

-- ---------------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_snapshots (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account       TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS','USD')),
  balance_cents INTEGER NOT NULL,
  date          TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT nf_now()
);
CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_snapshots(date);

-- ---------------------------------------------------------------------------
-- Objetivos
--
-- NULLS NOT DISTINCT es importante: sin eso, un objetivo de empresa (area y
-- user_id en NULL) nunca colisiona consigo mismo y el ON CONFLICT no dispara,
-- así que cargarlo dos veces creaba duplicados en silencio. SQLite tenía ese
-- bug latente; Postgres 15+ permite arreglarlo de raíz.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objectives (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period       TEXT NOT NULL,
  scope        TEXT NOT NULL CHECK (scope IN ('empresa','area','persona')),
  area         TEXT CHECK (area IN ('direccion','closer','paid_media','setter','desarrollo','marketing')),
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  metric_key   TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  target_value DOUBLE PRECISION NOT NULL,
  weight       DOUBLE PRECISION NOT NULL DEFAULT 1,
  direction    TEXT NOT NULL DEFAULT 'higher_is_better' CHECK (direction IN ('higher_is_better','lower_is_better')),
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT nf_now(),

  CONSTRAINT scope_coherente CHECK (
    (scope = 'empresa' AND user_id IS NULL AND area IS NULL) OR
    (scope = 'area'    AND user_id IS NULL AND area IS NOT NULL) OR
    (scope = 'persona' AND user_id IS NOT NULL)
  ),
  UNIQUE NULLS NOT DISTINCT (period, scope, area, user_id, metric_key)
);
CREATE INDEX IF NOT EXISTS idx_objectives_period ON objectives(period);

-- ---------------------------------------------------------------------------
-- Tareas, proyectos y contenido
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'tarea' CHECK (category IN (
                 'tarea','proyecto','landing','incidencia','correccion','contenido','proceso')),
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN (
                 'pendiente','en_curso','bloqueado','hecho','cancelada')),
  priority     TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta')),
  due_date     TEXT,
  done_at      TEXT,
  blocker      TEXT NOT NULL DEFAULT '',

  channel      TEXT NOT NULL DEFAULT '' CHECK (channel IN (
                 '','linkedin_netflow','linkedin_facundo','instagram','newsletter','otro')),
  planned_date TEXT,
  published_at TEXT,

  created_at   TEXT NOT NULL DEFAULT nf_now(),
  updated_at   TEXT NOT NULL DEFAULT nf_now(),

  CONSTRAINT bloqueada_necesita_motivo CHECK (
    status <> 'bloqueado' OR trim(blocker) <> ''
  )
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);

-- Comentarios: para que una tarea sea una conversación y no un título suelto
CREATE TABLE IF NOT EXISTS task_comments (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT nf_now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- ---------------------------------------------------------------------------
-- Archivos adjuntos
--
-- El binario NO vive en la base: vive en el almacenamiento de objetos y acá
-- queda la referencia. Meter archivos en Postgres infla los respaldos y hace
-- lenta cada consulta de la tabla.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- A qué está adjunto. Solo uno de estos tiene valor.
  lead_id       INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  client_id     INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_id       INTEGER REFERENCES tasks(id) ON DELETE CASCADE,

  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  -- Clave en el almacenamiento de objetos (Netlify Blobs o disco local)
  storage_key   TEXT NOT NULL UNIQUE,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT nf_now(),

  CONSTRAINT adjunto_pertenece_a_algo CHECK (
    (lead_id IS NOT NULL)::int + (client_id IS NOT NULL)::int + (task_id IS NOT NULL)::int = 1
  )
);
CREATE INDEX IF NOT EXISTS idx_attachments_lead   ON attachments(lead_id);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON attachments(client_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task   ON attachments(task_id);

-- ---------------------------------------------------------------------------
-- Paid media: creativos y tests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_assets (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'creativo' CHECK (kind IN ('creativo','test')),
  platform   TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  result     TEXT NOT NULL DEFAULT '',
  user_id    INTEGER REFERENCES users(id),
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT nf_now()
);
CREATE INDEX IF NOT EXISTS idx_assets_date ON campaign_assets(date);

-- ---------------------------------------------------------------------------
-- Avisos internos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','importante','urgente')),
  author_id  INTEGER REFERENCES users(id),
  starts_at  TEXT NOT NULL,
  ends_at    TEXT,
  created_at TEXT NOT NULL DEFAULT nf_now()
);

-- ---------------------------------------------------------------------------
-- Integraciones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  key          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'no_configurada' CHECK (status IN (
                 'no_configurada','configurada','activa','error')),
  config_json  TEXT NOT NULL DEFAULT '{}',
  last_sync_at TEXT,
  last_error   TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT nf_now()
);

CREATE TABLE IF NOT EXISTS integration_events (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source       TEXT NOT NULL,
  external_id  TEXT,
  event_type   TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  received_at  TEXT NOT NULL DEFAULT nf_now(),
  processed_at TEXT,
  result       TEXT NOT NULL DEFAULT 'pendiente',
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  UNIQUE NULLS NOT DISTINCT (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_events_src ON integration_events(source, received_at);

-- ---------------------------------------------------------------------------
-- Reuniones del calendario
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        TEXT NOT NULL,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  host_id      INTEGER REFERENCES users(id),
  booked_by_id INTEGER REFERENCES users(id),
  starts_at    TEXT NOT NULL,
  ends_at      TEXT,
  status       TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN (
                 'agendada','realizada','no_show','cancelada','reprogramada')),
  source       TEXT NOT NULL DEFAULT 'manual',
  external_id  TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT nf_now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);
