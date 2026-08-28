import type { SVGProps } from "react";

/**
 * Iconos en linea. Sin dependencias: son 24x24, trazo de 1.75 y heredan
 * currentColor, asi que siguen el color del texto y el tema sin configuracion.
 */

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconResumen = (p: Props) => (
  <Svg {...p}><path d="M3 13h5v8H3zM9.5 3h5v18h-5zM16 9h5v12h-5z" /></Svg>
);
export const IconFunnel = (p: Props) => (
  <Svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Svg>
);
export const IconCrm = (p: Props) => (
  <Svg {...p}><path d="M4 4h6v7H4zM14 4h6v11h-6zM4 15h6v5H4zM14 19h6" /></Svg>
);
export const IconClientes = (p: Props) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M17 11a2.6 2.6 0 1 0 0-5.2M18 20a5 5 0 0 0-2-4" /></Svg>
);
export const IconObjetivos = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></Svg>
);
export const IconTareas = (p: Props) => (
  <Svg {...p}><path d="M4 6.5 6 8.5 10 4.5M4 15.5 6 17.5 10 13.5M13 6.5h7M13 16.5h7" /></Svg>
);
export const IconCalendario = (p: Props) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
);
export const IconAlertas = (p: Props) => (
  <Svg {...p}><path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6zM10 20a2 2 0 0 0 4 0" /></Svg>
);
export const IconEquipo = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="7" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0M4.5 12.5A2.4 2.4 0 1 1 5 8M19.5 12.5A2.4 2.4 0 1 0 19 8" /></Svg>
);
export const IconFinanzas = (p: Props) => (
  <Svg {...p}><path d="M12 2.5v19M16.5 6.5H9.75a3.25 3.25 0 0 0 0 6.5h4.5a3.25 3.25 0 0 1 0 6.5H7" /></Svg>
);
export const IconInversion = (p: Props) => (
  <Svg {...p}><path d="M3 17l5.5-6 4 3.5L21 6M21 6h-5M21 6v5" /></Svg>
);
export const IconAjustes = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.93-1.16l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.16-2.93l-.06-.06A2 2 0 1 1 7.03 4.2l.06.06A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.93 1.16l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
);
export const IconIntegraciones = (p: Props) => (
  <Svg {...p}><path d="M10 4v5M14 4v5M7 9h10v4a5 5 0 0 1-10 0zM12 18v3" /></Svg>
);
export const IconPanel = (p: Props) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 9v11" /></Svg>
);
export const IconBuscar = (p: Props) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Svg>
);
export const IconSol = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" /></Svg>
);
export const IconLuna = (p: Props) => (
  <Svg {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></Svg>
);
export const IconMonitor = (p: Props) => (
  <Svg {...p}><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8.5 21h7M12 17v4" /></Svg>
);
export const IconArriba = (p: Props) => (
  <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
);
export const IconAbajo = (p: Props) => (
  <Svg {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
);
export const IconIgual = (p: Props) => (
  <Svg {...p}><path d="M5 10h14M5 14h14" /></Svg>
);
export const IconMas = (p: Props) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconCheck = (p: Props) => (
  <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>
);
export const IconFlecha = (p: Props) => (
  <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
);
export const IconMenu = (p: Props) => (
  <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
);
export const IconCerrar = (p: Props) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const IconSalir = (p: Props) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>
);
export const IconDescargar = (p: Props) => (
  <Svg {...p}><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" /></Svg>
);

export const NAV_ICONS = {
  "/resumen": IconResumen,
  "/funnel": IconFunnel,
  "/mi-panel": IconPanel,
  "/crm": IconCrm,
  "/clientes": IconClientes,
  "/inversion": IconInversion,
  "/objetivos": IconObjetivos,
  "/tareas": IconTareas,
  "/calendario": IconCalendario,
  "/alertas": IconAlertas,
  "/equipo": IconEquipo,
  "/finanzas": IconFinanzas,
  "/ajustes": IconAjustes,
  "/integraciones": IconIntegraciones,
} as const;
