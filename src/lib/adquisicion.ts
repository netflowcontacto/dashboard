/**
 * Tipos del dominio de adquisición: el funnel que NetFlow le opera a cada
 * cliente.
 *
 * Está separado de `types.ts` a propósito. Ahí vive el pipeline comercial de
 * NetFlow —médicos que la agencia quiere como clientes—; acá vive el de los
 * pacientes que cada cliente quiere conseguir. Son dos negocios distintos y
 * mezclar sus etapas en un solo tipo es la forma más rápida de terminar
 * promediando el CPL de la agencia con el de las cuentas.
 */

export type Plataforma = "meta" | "google" | "tiktok" | "otro";

export const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  otro: "Otra",
};

/** Etapas del paciente. El orden es el del embudo y se usa para calcularlo. */
export type EtapaPaciente =
  | "nuevo"
  | "contactado"
  | "respondio"
  | "calificando"
  | "calificado"
  | "agendado"
  | "asistio"
  | "seguimiento"
  | "cerrado";

export const ETAPAS_PACIENTE: EtapaPaciente[] = [
  "nuevo",
  "contactado",
  "respondio",
  "calificando",
  "calificado",
  "agendado",
  "asistio",
  "seguimiento",
  "cerrado",
];

/** Las que se muestran como columnas del tablero: lo abierto, sin el final. */
export const ETAPAS_PACIENTE_ABIERTAS: EtapaPaciente[] = ETAPAS_PACIENTE.filter(
  (e) => e !== "cerrado",
);

export const ETAPA_PACIENTE_LABEL: Record<EtapaPaciente, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  respondio: "Respondió",
  calificando: "Calificando",
  calificado: "Calificado",
  agendado: "Turno agendado",
  asistio: "Asistió",
  seguimiento: "Seguimiento",
  cerrado: "Cerrado",
};

/**
 * Calidad del lead.
 *
 * Es un campo y no un cálculo porque el que la sabe es quien habló con la
 * persona. Es también la única defensa contra la trampa del CPL: cien leads
 * baratos que no califican salen más caros que cuarenta que sí.
 */
export type Calidad = "A" | "B" | "C" | "D";

export const CALIDAD_LABEL: Record<Calidad, string> = {
  A: "A · Muy bueno",
  B: "B · Bueno",
  C: "C · Flojo",
  D: "D · No es cliente",
};

export const CALIDADES: Calidad[] = ["A", "B", "C", "D"];

/** A y B son las que cuentan como calificadas para el CPQL. */
export const CALIDADES_CALIFICADAS: Calidad[] = ["A", "B"];

export type EstadoTurno = "agendado" | "asistio" | "no_show" | "reprogramado" | "cancelado";

export const ESTADO_TURNO_LABEL: Record<EstadoTurno, string> = {
  agendado: "Agendado",
  asistio: "Asistió",
  no_show: "No-show",
  reprogramado: "Reprogramado",
  cancelado: "Cancelado",
};

export type EstadoCampana = "activa" | "pausada" | "finalizada" | "borrador";

export const ESTADO_CAMPANA_LABEL: Record<EstadoCampana, string> = {
  activa: "Activa",
  pausada: "Pausada",
  finalizada: "Finalizada",
  borrador: "Borrador",
};

export type FormatoCreatividad = "imagen" | "video" | "carrusel" | "texto" | "otro";

export const FORMATO_LABEL: Record<FormatoCreatividad, string> = {
  imagen: "Imagen",
  video: "Video",
  carrusel: "Carrusel",
  texto: "Solo texto",
  otro: "Otro",
};

/** De dónde salió una fila de gasto. Se muestra: importa si el dato es de la API o lo cargó alguien. */
export type OrigenDato = "manual" | "csv" | "meta_api" | "google_api";

export const ORIGEN_DATO_LABEL: Record<OrigenDato, string> = {
  manual: "Carga manual",
  csv: "Importado de CSV",
  meta_api: "Meta Ads API",
  google_api: "Google Ads API",
};

/**
 * Clasificación de una creatividad por el resultado de abajo del embudo.
 *
 * No sale del CTR. Un anuncio con mucho clic y ningún calificado es peor que
 * uno con la mitad de clics y el triple de turnos: lo que se compra son
 * pacientes, no clics.
 */
export type ClaseCreatividad =
  | "ganadora"
  | "escalando"
  | "probando"
  | "flojo"
  | "sin_datos";

export const CLASE_CREATIVIDAD_LABEL: Record<ClaseCreatividad, string> = {
  ganadora: "Ganadora",
  escalando: "Escalando",
  probando: "Probando",
  flojo: "Rinde poco",
  sin_datos: "Sin datos suficientes",
};

export interface Cliente {
  id: number;
  name: string;
}

export interface CuentaPublicitaria {
  id: number;
  client_id: number;
  platform: Plataforma;
  external_id: string;
  name: string;
  currency: "ARS" | "USD";
  status: "activa" | "pausada" | "cerrada";
  connected_at: string | null;
}

export interface Campana {
  id: number;
  ad_account_id: number;
  client_id: number;
  external_id: string;
  name: string;
  objective: string;
  status: EstadoCampana;
  daily_budget_cents: number;
  started_at: string | null;
}

export interface Paciente {
  id: number;
  client_id: number;
  campaign_id: number | null;
  ad_set_id: number | null;
  ad_id: number | null;
  name: string;
  phone: string;
  email: string;
  treatment: string;
  source: string;
  entered_at: string;
  assigned_to: number | null;
  stage: EtapaPaciente;
  outcome: "open" | "won" | "lost";
  quality: Calidad | null;
  quality_reason: string;
  next_action: string | null;
  next_action_date: string | null;
  first_contacted_at: string | null;
  responded_at: string | null;
  qualified_at: string | null;
  booked_at: string | null;
  showed_at: string | null;
  closed_at: string | null;
  no_show_count: number;
  lost_reason: string | null;
  value_cents: number;
  currency: "ARS" | "USD";
  notes: string;
}
