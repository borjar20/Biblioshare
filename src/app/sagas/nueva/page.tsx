import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { NewSagaForm } from "@/components/saga/new-saga-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Nueva saga — Biblioshare" };

// Gate duro collaborator+ (patrón saga/[id]/editar): sin sesión, a
// /login; sin rol suficiente, de vuelta al índice público.
export default async function NewSagaPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/sagas/nueva"));
  if (!hasMinRole(await getCurrentUserRole(), "collaborator")) redirect("/sagas");

  const t = await getTranslations("sagaIndex");
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("newTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("newSubtitle")}</p>
      </div>
      <NewSagaForm />
    </div>
  );
}
