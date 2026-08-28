import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { homeFor } from "@/lib/permissions";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">NetFlow</h1>
          <p className="mt-1 text-sm text-muted">Centro de control interno</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-faint">
          Acceso restringido al equipo de NetFlow.
        </p>
      </div>
    </main>
  );
}
