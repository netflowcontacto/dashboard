-- ============================================================================
-- NetFlow - Centro de control interno
-- Esquema SQLite. Todo el dinero se guarda en centavos (INTEGER) + moneda,
-- para no perder nunca el valor original. La consolidacion ARS/USD se hace
-- en la capa de metricas usando el tipo de cambio de referencia (settings).
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuarios y configuracion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  area          TEXT NOT NULL CHECK (area IN ('direccion','closer','paid_media','setter','desarrollo')),
  job_title     TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- CRM: oportunidades
--
-- Reglas de negocio garantizadas por la base, no solo por la UI:
--   * toda oportunidad tiene responsable (owner_id NOT NULL)
--   * ninguna oportunidad abierta puede quedar sin proxima accion + fecha
--   * ninguna oportunidad perdida puede quedar sin motivo de perdida
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  company               TEXT NOT NULL DEFAULT '',
  specialty             TEXT NOT NULL DEFAULT '',
  contact_email         TEXT NOT NULL DEFAULT '',
  contact_phone         TEXT NOT NULL DEFAULT '',
  source                TEXT NOT NULL DEFAULT 'otro',

  entered_at            TEXT NOT NULL,                 -- YYYY-MM-DD, fecha de ingreso

  -- Responsables. owner_id responde "quien tiene la proxima accion".
  owner_id              INTEGER NOT NULL REFERENCES users(id),
  setter_id             INTEGER REFERENCES users(id),
  closer_id             INTEGER REFERENCES users(id),

  stage                 TEXT NOT NULL DEFAULT 'nuevo' CHECK (stage IN (
                          'nuevo','contactado','calificado','reunion_agendada',
                          'reunion_realizada','propuesta','follow_up','ganado','perdido')),

  next_action           TEXT,
  next_action_date      TEXT,                          -- YYYY-MM-DD

  -- Reunion
  meeting_scheduled_at  TEXT,                          -- cuando se AGENDO (datetime)
  meeting_at            TEXT,                          -- cuando OCURRE (datetime)
  meeting_held_at       TEXT,                          -- cuando se REALIZO (datetime)
  meeting_outcome       TEXT NOT NULL DEFAULT 'sin_reunion' CHECK (meeting_outcome IN (
                          'sin_reunion','agendada','realizada','no_show','reprogramada','cancelada')),
  no_show_count         INTEGER NOT NULL DEFAULT 0,
  recovered_from_noshow INTEGER NOT NULL DEFAULT 0 CHECK (recovered_from_noshow IN (0,1)),
  follow_up_count       INTEGER NOT NULL DEFAULT 0,

  plan_interest         TEXT NOT NULL DEFAULT '',
  potential_value_cents INTEGER NOT NULL DEFAULT 0,
  potential_currency    TEXT NOT NULL DEFAULT 'USD' CHECK (potential_currency IN ('ARS','USD')),

  -- Marcas de tiempo del embudo (se completan solas al mover de etapa)
  first_contacted_at    TEXT,
  qualified_at          TEXT,
  proposal_sent_at      TEXT,
  closed_at             TEXT,

  outcome               TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','won','lost')),
  lost_reason           TEXT,
  notes                 TEXT NOT NULL DEFAULT '',

  client_id             INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),

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

-- Bitacora del embudo: cada movimiento queda registrado (auditoria + metricas)
CREATE TABLE IF NOT EXISTS lead_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                  -- cambio_etapa | follow_up | nota | no_show | recuperacion | integracion
  from_stage TEXT,
  to_stage   TEXT,
  detail     TEXT NOT NULL DEFAULT '',
  user_id    INTEGER REFERENCES users(id),
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_at   ON lead_events(at);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  specialty            TEXT NOT NULL DEFAULT '',
  plan                 TEXT NOT NULL DEFAULT '',
  fee_cents            INTEGER NOT NULL DEFAULT 0,
  fee_currency         TEXT NOT NULL DEFAULT 'USD' CHECK (fee_currency IN ('ARS','USD')),

  start_date           TEXT NOT NULL,                   -- fecha de alta
  next_charge_date     TEXT,
  payment_status       TEXT NOT NULL DEFAULT 'al_dia' CHECK (payment_status IN ('al_dia','pendiente','vencido')),

  paid_media_owner_id  INTEGER REFERENCES users(id),
  setter_owner_id      INTEGER REFERENCES users(id),

  dev_required         INTEGER NOT NULL DEFAULT 0 CHECK (dev_required IN (0,1)),
  landing              INTEGER NOT NULL DEFAULT 0 CHECK (landing IN (0,1)),
  onboarding_status    TEXT NOT NULL DEFAULT 'pendiente' CHECK (onboarding_status IN (
                         'pendiente','en_curso','completo')),

  -- Semaforo del estado general de la cuenta
  account_health       TEXT NOT NULL DEFAULT 'bien' CHECK (account_health IN ('bien','atencion','riesgo')),
  alerts_note          TEXT NOT NULL DEFAULT '',

  renewal_date         TEXT,
  churned_at           TEXT,
  churn_reason         TEXT,

  notes                TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT baja_necesita_motivo CHECK (
    churned_at IS NULL OR (churn_reason IS NOT NULL AND trim(churn_reason) <> '')
  )
);
CREATE INDEX IF NOT EXISTS idx_clients_start   ON clients(start_date);
CREATE INDEX IF NOT EXISTS idx_clients_churned ON clients(churned_at);

-- ---------------------------------------------------------------------------
-- Facturacion (cobrada / pendiente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,                            -- YYYY-MM
  concept      TEXT NOT NULL DEFAULT 'Fee mensual',
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('ARS','USD')),
  issued_at    TEXT NOT NULL,
  due_at       TEXT,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','cobrada','incobrable')),
  paid_at      TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT cobrada_necesita_fecha CHECK (status <> 'cobrada' OR paid_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ---------------------------------------------------------------------------
-- Gastos
--
-- Fuente unica de verdad. La inversion publicitaria NO vive en otra tabla:
-- es category = 'paid_media'. Asi el funnel y las finanzas nunca se contradicen
-- ni se duplica el numero.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  concept      TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN (
                 'paid_media','personal_equipo','software','desarrollo','marketing_contenido',
                 'legal','contable','infraestructura','comisiones','bonos','otros')),
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS','USD')),
  date         TEXT NOT NULL,                            -- YYYY-MM-DD
  cost_type    TEXT NOT NULL DEFAULT 'variable' CHECK (cost_type IN ('fijo','variable')),
  recurrence   TEXT NOT NULL DEFAULT 'no_recurrente' CHECK (recurrence IN ('recurrente','no_recurrente')),
  vendor       TEXT NOT NULL DEFAULT '',                 -- proveedor / persona
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  direct_cost  INTEGER NOT NULL DEFAULT 0 CHECK (direct_cost IN (0,1)),  -- costo directo de servicio
  status       TEXT NOT NULL DEFAULT 'pagado' CHECK (status IN ('pagado','pendiente')),

  -- Solo para category = 'paid_media': alimenta el funnel comercial
  platform     TEXT NOT NULL DEFAULT '',
  campaign     TEXT NOT NULL DEFAULT '',

  notes        TEXT NOT NULL DEFAULT '',
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_client   ON expenses(client_id);

-- ---------------------------------------------------------------------------
-- Caja: se carga a mano como saldo declarado por cuenta.
-- El runway se calcula contra el burn real de gastos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account       TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS','USD')),
  balance_cents INTEGER NOT NULL,
  date          TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_snapshots(date);

-- ---------------------------------------------------------------------------
-- Objetivos: empresa / area / persona.
-- metric_key conecta el objetivo con el motor de metricas: el resultado actual
-- se calcula solo, no se carga a mano.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objectives (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period       TEXT NOT NULL,                            -- YYYY-MM
  scope        TEXT NOT NULL CHECK (scope IN ('empresa','area','persona')),
  area         TEXT CHECK (area IN ('direccion','closer','paid_media','setter','desarrollo')),
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  metric_key   TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  target_value REAL NOT NULL,
  weight       REAL NOT NULL DEFAULT 1,
  direction    TEXT NOT NULL DEFAULT 'higher_is_better' CHECK (direction IN ('higher_is_better','lower_is_better')),
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT scope_coherente CHECK (
    (scope = 'empresa' AND user_id IS NULL AND area IS NULL) OR
    (scope = 'area'    AND user_id IS NULL AND area IS NOT NULL) OR
    (scope = 'persona' AND user_id IS NOT NULL)
  ),
  UNIQUE (period, scope, area, user_id, metric_key)
);
CREATE INDEX IF NOT EXISTS idx_objectives_period ON objectives(period);

-- ---------------------------------------------------------------------------
-- Tareas, proyectos y contenido
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'tarea' CHECK (category IN (
                 'tarea','proyecto','landing','incidencia','correccion','contenido','proceso')),
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN (
                 'pendiente','en_curso','bloqueado','hecho','cancelada')),
  priority     TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta')),
  due_date     TEXT,
  done_at      TEXT,
  blocker      TEXT NOT NULL DEFAULT '',

  -- Solo contenido (category = 'contenido')
  channel      TEXT NOT NULL DEFAULT '' CHECK (channel IN (
                 '','linkedin_netflow','linkedin_facundo','instagram','newsletter','otro')),
  planned_date TEXT,
  published_at TEXT,

  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT bloqueada_necesita_motivo CHECK (
    status <> 'bloqueado' OR trim(blocker) <> ''
  )
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);

-- ---------------------------------------------------------------------------
-- Paid media: creativos y tests (metrica de Sophia)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'creativo' CHECK (kind IN ('creativo','test')),
  platform   TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  result     TEXT NOT NULL DEFAULT '',
  user_id    INTEGER REFERENCES users(id),
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_date ON campaign_assets(date);

-- ---------------------------------------------------------------------------
-- Avisos internos (los publica direccion, los ve el equipo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','importante','urgente')),
  author_id  INTEGER REFERENCES users(id),
  starts_at  TEXT NOT NULL,
  ends_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Integraciones (V2/V3). La arquitectura queda lista; si no hay integracion
-- configurada la app funciona igual, solo que la carga es manual.
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
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Todo payload entrante se guarda crudo: permite auditar y reprocesar
CREATE TABLE IF NOT EXISTS integration_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,                    -- calendly | google_calendar | form | manychat | meta_ads
  external_id  TEXT,
  event_type   TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  received_at  TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  result       TEXT NOT NULL DEFAULT 'pendiente',
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_events_src ON integration_events(source, received_at);

-- ---------------------------------------------------------------------------
-- Reuniones del calendario (se llenan a mano en V1, por Calendly/Google en V2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  host_id      INTEGER REFERENCES users(id),
  booked_by_id INTEGER REFERENCES users(id),
  starts_at    TEXT NOT NULL,
  ends_at      TEXT,
  status       TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN (
                 'agendada','realizada','no_show','cancelada','reprogramada')),
  source       TEXT NOT NULL DEFAULT 'manual',   -- manual | calendly | google_calendar
  external_id  TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);
