import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { ImportForm } from "./import-form";

export const metadata: Metadata = {
  title: "Importar biblioteca — Biblioshare",
};

// Safety margin for the batch-commit Server Actions this page invokes, which
// may make several external catalog API calls per row. Capped by the
// deployment's plan tier regardless (e.g. Vercel Hobby caps at 60s).
export const maxDuration = 60;

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getCurrentUserRole(supabase);
  // Resolving an unmatched row manually creates a freeform catalog entry —
  // same trust level as /buscar/manual, so gated the same way (§7.35).
  const canResolveManually = hasMinRole(role, "collaborator");

  const t = await getTranslations("import");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ImportForm canResolveManually={canResolveManually} />
    </div>
  );
}
