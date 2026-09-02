"use client";

import { useTransition } from "react";
import { registrarContacto } from "@/actions/actividad";
import { enlaceEmail, enlaceLlamada, enlaceWhatsapp, mensajeInicial } from "@/lib/contacto";
import { IconEmail, IconTelefono, IconWhatsapp } from "./icons";
import { useToast } from "./Toast";

/**
 * Contactar desde la ficha, en un toque.
 *
 * Al abrir el canal se registra el intento en la bitácora y, si era el primer
 * contacto, se completa la fecha. Así el tiempo de respuesta del setter se
 * llena con el trabajo real en vez de depender de que alguien se acuerde de
 * volver a la pantalla a actualizar el CRM.
 */
export default function ContactActions({
  leadId,
  nombre,
  empresa,
  telefono,
  email,
  size = "md",
}: {
  leadId: number;
  nombre: string;
  empresa: string;
  telefono: string;
  email: string;
  size?: "sm" | "md";
}) {
  const [, startTransition] = useTransition();
  const toast = useToast();

  const wa = telefono ? enlaceWhatsapp(telefono, mensajeInicial(nombre, empresa)) : null;
  const tel = telefono ? enlaceLlamada(telefono) : null;
  const mail = email ? enlaceEmail(email, `NetFlow · ${empresa || nombre}`) : null;

  if (!wa && !tel && !mail) {
    return size === "md" ? (
      <p className="text-xs text-faint">Sin teléfono ni email cargados.</p>
    ) : null;
  }

  function registrar(tipo: "whatsapp" | "llamada" | "email", etiqueta: string) {
    const fd = new FormData();
    fd.set("lead_id", String(leadId));
    fd.set("tipo", tipo);
    // El aviso espera al servidor. Antes se disparaba junto con la llamada y
    // decía "registrado" siempre, aunque el registro fallara: el canal se abre
    // igual, pero afirmar que quedó anotado cuando no quedó es justo lo que
    // hace que después nadie confíe en la bitácora.
    startTransition(async () => {
      try {
        await registrarContacto(fd);
        toast({ message: `${etiqueta} registrado en la bitácora.` });
      } catch {
        toast({
          message: `Se abrió ${etiqueta}, pero no se pudo registrar en la bitácora. Anotalo a mano.`,
          tone: "error",
        });
      }
    });
  }

  const clase =
    size === "sm"
      ? "btn btn-sm gap-1 px-2"
      : "btn gap-1.5";

  return (
    // En chico van los tres iconos en una sola fila: partidos en dos renglones
    // desalinean las filas de la tabla y hacen ver la columna como un error.
    <div className={`flex items-center gap-1.5 ${size === "sm" ? "flex-nowrap" : "flex-wrap"}`}>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => registrar("whatsapp", "WhatsApp")}
          className={clase}
          title="Abrir WhatsApp con un primer mensaje ya escrito"
        >
          <IconWhatsapp size={size === "sm" ? 13 : 15} />
          {size === "md" && "WhatsApp"}
        </a>
      )}
      {tel && (
        <a
          href={tel}
          onClick={() => registrar("llamada", "Llamada")}
          className={clase}
          title="Llamar"
        >
          <IconTelefono size={size === "sm" ? 13 : 15} />
          {size === "md" && "Llamar"}
        </a>
      )}
      {mail && (
        <a
          href={mail}
          onClick={() => registrar("email", "Email")}
          className={clase}
          title="Escribir un email"
        >
          <IconEmail size={size === "sm" ? 13 : 15} />
          {size === "md" && "Email"}
        </a>
      )}
    </div>
  );
}
