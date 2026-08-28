export type Role = "admin" | "member";
export type Area = "direccion" | "closer" | "paid_media" | "setter" | "desarrollo" | "marketing";
export type Currency = "ARS" | "USD";

export type Stage =
  | "nuevo"
  | "contactado"
  | "calificado"
  | "reunion_agendada"
  | "reunion_realizada"
  | "propuesta"
  | "follow_up"
  | "ganado"
  | "perdido";

/** Orden canonico del pipeline comercial de NetFlow. */
export const STAGES: Stage[] = [
  "nuevo",
  "contactado",
  "calificado",
  "reunion_agendada",
  "reunion_realizada",
  "propuesta",
  "follow_up",
  "ganado",
  "perdido",
];

export const STAGE_LABEL: Record<Stage, string> = {
  nuevo: "Nuevo lead",
  contactado: "Contactado",
  calificado: "Calificado",
  reunion_agendada: "Reunión agendada",
  reunion_realizada: "Reunión realizada",
  propuesta: "Propuesta",
  follow_up: "Follow-up",
  ganado: "Ganado",
  perdido: "Perdido",
};

export const AREA_LABEL: Record<Area, string> = {
  direccion: "Dirección y gestión",
  closer: "Closer",
  paid_media: "Paid Media",
  setter: "Setter",
  desarrollo: "Desarrollo",
  marketing: "Marketing y contenido",
};

export const EXPENSE_CATEGORIES = [
  "paid_media",
  "personal_equipo",
  "software",
  "desarrollo",
  "marketing_contenido",
  "legal",
  "contable",
  "infraestructura",
  "comisiones",
  "bonos",
  "otros",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  paid_media: "Paid Media NetFlow",
  personal_equipo: "Personal / equipo",
  software: "Software",
  desarrollo: "Desarrollo",
  marketing_contenido: "Marketing / contenido",
  legal: "Legal",
  contable: "Contable",
  infraestructura: "Infraestructura",
  comisiones: "Comisiones",
  bonos: "Bonos",
  otros: "Otros",
};

export type Health = "bien" | "atencion" | "riesgo";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  area: Area;
  job_title: string;
  active: number;
}

export interface Lead {
  id: number;
  name: string;
  company: string;
  specialty: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  entered_at: string;
  owner_id: number;
  setter_id: number | null;
  closer_id: number | null;
  stage: Stage;
  next_action: string | null;
  next_action_date: string | null;
  meeting_scheduled_at: string | null;
  meeting_at: string | null;
  meeting_held_at: string | null;
  meeting_outcome: string;
  no_show_count: number;
  recovered_from_noshow: number;
  follow_up_count: number;
  plan_interest: string;
  potential_value_cents: number;
  potential_currency: Currency;
  first_contacted_at: string | null;
  qualified_at: string | null;
  proposal_sent_at: string | null;
  closed_at: string | null;
  outcome: "open" | "won" | "lost";
  lost_reason: string | null;
  notes: string;
  client_id: number | null;
}

export interface Client {
  id: number;
  name: string;
  specialty: string;
  plan: string;
  fee_cents: number;
  fee_currency: Currency;
  start_date: string;
  next_charge_date: string | null;
  payment_status: "al_dia" | "pendiente" | "vencido";
  paid_media_owner_id: number | null;
  setter_owner_id: number | null;
  dev_required: number;
  landing: number;
  onboarding_status: "pendiente" | "en_curso" | "completo";
  account_health: Health;
  alerts_note: string;
  renewal_date: string | null;
  churned_at: string | null;
  churn_reason: string | null;
  notes: string;
}

/* --------------------------------------------------------------------------
   Etiquetas de presentación.

   Los valores de la base son snake_case en minúscula porque son claves, no
   texto. Mostrarlos crudos ("no_show", "correccion", "al_dia") hace que el
   producto se vea sin terminar. Toda pantalla que muestre uno de estos
   valores pasa por acá.
   -------------------------------------------------------------------------- */

export const TASK_CATEGORY_LABEL: Record<string, string> = {
  tarea: "Tarea",
  proyecto: "Proyecto",
  landing: "Landing",
  incidencia: "Incidencia",
  correccion: "Corrección",
  contenido: "Contenido",
  proceso: "Proceso",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  bloqueado: "Bloqueado",
  hecho: "Hecho",
  cancelada: "Cancelada",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  al_dia: "Al día",
  pendiente: "Pendiente",
  vencido: "Vencido",
};

export const ONBOARDING_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  completo: "Completo",
};

export const MEETING_OUTCOME_LABEL: Record<string, string> = {
  sin_reunion: "Sin reunión",
  agendada: "Agendada",
  realizada: "Realizada",
  no_show: "No-show",
  reprogramada: "Reprogramada",
  cancelada: "Cancelada",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  cobrada: "Cobrada",
  incobrable: "Incobrable",
};

export const EXPENSE_STATUS_LABEL: Record<string, string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
};

export const COST_TYPE_LABEL: Record<string, string> = {
  fijo: "Fijo",
  variable: "Variable",
};

export const RECURRENCE_LABEL: Record<string, string> = {
  recurrente: "Recurrente",
  no_recurrente: "No recurrente",
};

export const PRIORITY_LABEL: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const SOURCE_LABEL: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  instagram_ads: "Instagram Ads",
  pauta: "Pauta",
  referido: "Referido",
  linkedin: "LinkedIn",
  outbound: "Outbound",
  web: "Web",
  manychat: "ManyChat",
  calendly: "Calendly",
  form: "Formulario",
  otro: "Otro",
};

export const CHANNEL_LABEL: Record<string, string> = {
  "": "—",
  linkedin_netflow: "LinkedIn NetFlow",
  linkedin_facundo: "LinkedIn Facundo",
  instagram: "Instagram",
  newsletter: "Newsletter",
  otro: "Otro",
};

export const LEAD_EVENT_LABEL: Record<string, string> = {
  cambio_etapa: "Cambio de etapa",
  follow_up: "Follow-up",
  nota: "Nota",
  no_show: "No-show",
  recuperacion: "Recuperación",
  integracion: "Integración",
};

export const INTEGRATION_STATUS_LABEL: Record<string, string> = {
  no_configurada: "Sin configurar",
  configurada: "Configurada",
  activa: "Activa",
  error: "Con error",
};

/** Último recurso: convierte una clave desconocida en algo legible. */
export function humanize(value: string): string {
  if (!value) return "—";
  const s = value.replace(/_/g, " ");
  return s[0].toUpperCase() + s.slice(1);
}
