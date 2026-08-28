import { requireUser } from "@/lib/auth";
import { can, isAdmin, ROLE_LABEL } from "@/lib/permissions";
import { alertsFor } from "@/lib/alerts";
import Nav, { type NavItem } from "@/components/Nav";

/**
 * Shell de la aplicacion.
 *
 * La navegacion se arma en el servidor a partir de los permisos: una persona
 * del equipo ni siquiera recibe el link a Finanzas. De todas formas cada
 * pagina sensible vuelve a validar con requireAdmin(): ocultar el link no es
 * un control de acceso.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const alertCount = alertsFor(user).filter((a) => a.severity !== "info").length;

  const items: NavItem[] = [];

  if (admin) {
    items.push({ href: "/resumen", label: "Resumen general", group: "Direccion" });
    items.push({ href: "/funnel", label: "Funnel comercial", group: "Direccion" });
  }
  items.push({ href: "/mi-panel", label: "Mi panel", group: admin ? "Direccion" : "Mi trabajo" });

  items.push({ href: "/crm", label: "CRM", group: "Comercial" });
  items.push({ href: "/clientes", label: "Clientes", group: "Comercial" });

  items.push({ href: "/objetivos", label: "Objetivos", group: "Operacion" });
  items.push({ href: "/tareas", label: "Tareas y proyectos", group: "Operacion" });
  items.push({ href: "/calendario", label: "Calendario", group: "Operacion" });
  items.push({ href: "/alertas", label: "Alertas", group: "Operacion" });

  if (can(user, "paid_media:cargar")) {
    items.push({ href: "/inversion", label: "Inversion publicitaria", group: "Comercial" });
  }
  if (can(user, "equipo:ver_todos")) {
    items.push({ href: "/equipo", label: "Equipo y performance", group: "Operacion" });
  }
  if (can(user, "finanzas:ver")) {
    items.push({ href: "/finanzas", label: "Finanzas", group: "Administracion" });
  }
  if (can(user, "ajustes:gestionar")) {
    items.push({ href: "/ajustes", label: "Ajustes", group: "Administracion" });
    items.push({ href: "/integraciones", label: "Integraciones", group: "Administracion" });
  }

  return (
    <div className="flex min-h-screen">
      <Nav
        items={items}
        user={{ name: user.name, role: ROLE_LABEL[user.role], jobTitle: user.job_title }}
        alertCount={alertCount}
      />
      <main className="min-w-0 flex-1 px-4 py-6 pt-16 md:px-6 md:pt-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
