/**
 * Traduce los errores de la base al lenguaje del equipo.
 * Los CHECK constraints son la ultima linea de defensa de las reglas de
 * negocio; cuando saltan, la persona tiene que leer algo accionable y no
 * un mensaje de SQLite.
 */
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);

  if (raw.includes("lead_abierto_necesita_proxima_accion")) {
    return "Una oportunidad abierta no puede quedar sin proxima accion y fecha.";
  }
  if (raw.includes("lead_perdido_necesita_motivo")) {
    return "Para dar por perdida una oportunidad hay que indicar el motivo.";
  }
  if (raw.includes("baja_necesita_motivo")) {
    return "Para dar de baja un cliente hay que indicar el motivo.";
  }
  if (raw.includes("bloqueada_necesita_motivo")) {
    return "Una tarea bloqueada necesita que describas el bloqueo.";
  }
  if (raw.includes("cobrada_necesita_fecha")) {
    return "Una factura cobrada necesita fecha de cobro.";
  }
  if (raw.includes("scope_coherente")) {
    return "El objetivo no es coherente: revisa si es de empresa, de area o de persona.";
  }
  if (raw.includes("UNIQUE constraint")) {
    return "Ya existe un registro con esos datos.";
  }
  if (raw.includes("FOREIGN KEY constraint")) {
    return "Hay una referencia invalida (persona o cliente inexistente).";
  }
  if (raw.includes("CHECK constraint")) {
    return "Los datos no cumplen una regla de negocio. Revisa los campos obligatorios.";
  }
  return raw;
}

export interface ActionState {
  error?: string;
  ok?: string;
}
