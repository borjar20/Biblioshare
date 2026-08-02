import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getMyPendingRows, getReviewQueue } from "@/lib/import/pending";
import { ResolveForm } from "./resolve-form";
import { DismissButton } from "./dismiss-button";

export const metadata: Metadata = {
  title: "Import pendiente — Biblioshare",
};

export default async function PendingImportPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/importar/pendientes"));

  const t = await getTranslations("import");
  const isCollaborator = hasMinRole(await getCurrentUserRole(supabase), "collaborator");

  const [mine, queue] = await Promise.all([
    getMyPendingRows(supabase, user.id),
    isCollaborator ? getReviewQueue(supabase) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pendingTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pendingDescription")}</p>
        <Link href="/importar" className="text-sm text-accent underline">
          {t("backToImport")}
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("myPending")}</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPending")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{p.row.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground uppercase">
                    {t(`pendingStatus.${p.status}`)}
                  </span>
                </div>
                <DismissButton pendingId={p.id} label={t("dismiss")} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCollaborator && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("reviewQueue")}</h2>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyQueue")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {queue.map((p) => (
                <li key={p.id}>
                  <ResolveForm
                    pendingId={p.id}
                    itemType={p.itemType}
                    row={p.row}
                    ownerName={p.ownerName ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
