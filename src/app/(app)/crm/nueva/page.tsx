import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { usersList } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";
import LeadForm from "../LeadForm";

export const dynamic = "force-dynamic";

export default async function NuevaOportunidadPage() {
  const user = await requireUser();
  if (!can(user, "crm:editar")) {
    return <p className="text-sm text-muted">No tenes permiso para cargar oportunidades.</p>;
  }

  return (
    <>
      <PageHeader title="Nueva oportunidad" description="Toda oportunidad nace con responsable y proxima accion.">
        <Link href="/crm" className="btn">
          Volver al CRM
        </Link>
      </PageHeader>
      <Card>
        <LeadForm users={usersList()} today={todayISO()} />
      </Card>
    </>
  );
}
