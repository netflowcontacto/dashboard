/**
 * Enlaces de contacto directo.
 *
 * Que el setter pueda escribir por WhatsApp desde la ficha, sin copiar el
 * número a mano, es la diferencia entre usar el CRM y tenerlo abierto al lado.
 */

/** Código de país por defecto para números sin prefijo. Argentina. */
const PAIS_POR_DEFECTO = "54";

/**
 * Normaliza un teléfono al formato que espera WhatsApp: solo dígitos, con
 * código de país. Acepta lo que la gente escribe de verdad: "+54 9 11 1234-5678",
 * "011 1234 5678", "1112345678".
 */
export function telefonoParaWhatsapp(raw: string): string | null {
  if (!raw) return null;

  let n = raw.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else {
    // Sin prefijo internacional: se quita el 0 de larga distancia y se antepone el país.
    n = n.replace(/^0/, "");
    n = PAIS_POR_DEFECTO + n;
  }

  // Un número argentino de celular necesita el 9 después del 54 para WhatsApp.
  if (n.startsWith("54") && !n.startsWith("549")) {
    const resto = n.slice(2).replace(/^15/, "");
    n = `549${resto}`;
  }

  return n.length >= 10 && n.length <= 15 ? n : null;
}

export function enlaceWhatsapp(telefono: string, mensaje?: string): string | null {
  const n = telefonoParaWhatsapp(telefono);
  if (!n) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${n}${texto}`;
}

export function enlaceLlamada(telefono: string): string | null {
  const n = telefono.replace(/[^\d+]/g, "");
  return n.length >= 6 ? `tel:${n}` : null;
}

export function enlaceEmail(email: string, asunto?: string): string | null {
  if (!email.includes("@")) return null;
  const s = asunto ? `?subject=${encodeURIComponent(asunto)}` : "";
  return `mailto:${email}${s}`;
}

/** Primer mensaje sugerido. Se puede editar antes de enviar en WhatsApp. */
export function mensajeInicial(nombre: string, empresa: string): string {
  const a = nombre.split(" ")[0] || nombre;
  const ref = empresa ? ` de ${empresa}` : "";
  return `Hola ${a}, te escribo de NetFlow${ref ? "" : ""}. Vi que dejaste tus datos${ref} y quería coordinar una llamada corta para contarte cómo trabajamos. ¿Te viene bien?`;
}
