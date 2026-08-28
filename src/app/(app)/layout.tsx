import { requireUser } from "@/lib/auth";
import { can, isAdmin, ROLE_LABEL } from "@/lib/permissions";
import { alertsFor } from "@/lib/alerts";
import Nav, { type NavItem } from "@/components/Nav";

/**
 * Shell de la aplicacion.
 *
 * La navegación se arma en el servidor a partir de los permisos: una persona
 * del equipo ni siquiera recibe el link a Finanzas. De todas formas cada
 * página sensible vuelve a validar con requireAdmin(): ocultar el link no es
 * un control de acceso.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const alertCount = alertsFor(user).filter((a) => a.severity !== "info").length;

  const items: NavItem[] = [];

  if (admin) {
    items.push({ href: "/resumen", label: "Resumen general", group: "Dirección" });
    items.push({ href: "/funnel", label: "Funnel comercial", group: "Dirección" });
  }
  items.push({ href: "/mi-panel", label: "Mi panel", group: admin ? "Dirección" : "Mi trabajo" });

  items.push({ href: "/crm", label: "CRM", group: "Comercial" });
  items.push({ href: "/clientes", label: "Clientes", group: "Comercial" });

  items.push({ href: "/objetivos", label: "Objetivos", group: "Operación" });
  items.push({ href: "/tareas", label: "Tareas y proyectos", group: "Operación" });
  items.push({ href: "/calendario", label: "Calendario", group: "Operación" });
  items.push({ href: "/alertas", label: "Alertas", group: "Operación" });

  if (can(user, "paid_media:cargar")) {
    items.push({ href: "/inversion", label: "Inversión publicitaria", group: "Comercial" });
  }
  if (can(user, "equipo:ver_todos")) {
    items.push({ href: "/equipo", label: "Equipo y performance", group: "Operación" });
  }
  if (can(user, "finanzas:ver")) {
    items.push({ href: "/finanzas", label: "Finanzas", group: "Administración" });
  }
  if (can(user, "ajustes:gestionar")) {
    items.push({ href: "/ajustes", label: "Ajustes", group: "Administración" });
    items.push({ href: "/integraciones", label: "Integraciones", group: "Administración" });
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
