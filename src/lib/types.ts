export type Role = "admin" | "member";
export type Area = "direccion" | "closer" | "paid_media" | "setter" | "desarrollo";
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
  reunion_agendada: "Reunion agendada",
  reunion_realizada: "Reunion realizada",
  propuesta: "Propuesta",
  follow_up: "Follow-up",
  ganado: "Ganado",
  perdido: "Perdido",
};

export const AREA_LABEL: Record<Area, string> = {
  direccion: "Direccion / Marketing / Gestion",
  closer: "CEO / Closer",
  paid_media: "Paid Media",
  setter: "Setter",
  desarrollo: "Desarrollo",
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
