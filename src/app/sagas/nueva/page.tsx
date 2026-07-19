import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { NewSagaForm } from "@/components/saga/new-saga-form";

export const metadata: Metadata = { title: "Nueva saga — Biblioshare" };

// Gate duro collaborator+ (patrón saga/[id]/mapa/editar): sin sesión, a
// /login; sin rol suficiente, de vuelta al índice público.
export default async function NewSagaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect("/sagas");

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
