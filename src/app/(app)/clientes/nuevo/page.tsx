import Link from "next/link";
import { requireAdminOr404 } from "@/lib/auth";
import { usersList } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";
import ClientForm from "../ClientForm";

export const dynamic = "force-dynamic";

export default async function NuevoClientePage() {
  await requireAdminOr404();
  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        description="Normalmente los clientes se crean solos al cerrar una oportunidad. Esto es para altas manuales."
      >
        <Link href="/clientes" className="btn">
          Volver
        </Link>
      </PageHeader>
      <Card>
        <ClientForm users={await usersList()} today={todayISO()} />
      </Card>
    </>
  );
}
