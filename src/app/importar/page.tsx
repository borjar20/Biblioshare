import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { countMyPending } from "@/lib/import/pending";
import { SHELL_APP } from "@/lib/ui/layout";
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
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/importar"));

  const role = await getCurrentUserRole(supabase);
  // Resolving an unmatched row manually creates a freeform catalog entry —
  // same trust level as /buscar/manual, so gated the same way (§7.35).
  const canResolveManually = hasMinRole(role, "collaborator");

  const pendingCount = await countMyPending(supabase, user.id);

  const t = await getTranslations("import");

  return (
    // El contenedor se ensancha SIEMPRE, pero quien decide si eso se nota es
    // ImportForm: sus fases «subir» y «procesar» se ponen su propio tope. El
    // ancho no puede depender de la fase desde aquí — la fase es estado de
    // cliente y esto es un server component.
    <div className={`mx-auto flex w-full ${SHELL_APP} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <Link href="/importar/pendientes" className="text-sm text-accent underline">
          {pendingCount > 0
            ? t("pendingLinkCount", { count: pendingCount })
            : t("pendingLink")}
        </Link>
      </div>
      <ImportForm canResolveManually={canResolveManually} />
    </div>
  );
}
