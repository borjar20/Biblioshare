import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getMyPendingRows, getReviewQueue } from "@/lib/import/pending";
import { FORM_CARD_GRID_COLS, SHELL_APP } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { ResolveForm } from "./resolve-form";
import { DismissButton } from "./dismiss-button";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
    <div className={`mx-auto flex w-full ${SHELL_APP} flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="flex flex-col gap-2">
        <PageHeader title={t("pendingTitle")} />
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
          /* Fichas mínimas —título, estado, descartar—, así que caben tres. En
             una sola columna eran barras anchas con un palmo de vacío entre el
             título y el botón. */
          (<ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          </ul>)
        )}
      </section>

      {isCollaborator && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("reviewQueue")}</h2>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyQueue")}</p>
          ) : (
            /* La cola de revisión es donde más se nota: cada elemento es un
               formulario completo, y a dos columnas se ven el doble de filas
               sin que ningún campo quede apretado. */
            (<ul className={`grid items-start gap-3 ${FORM_CARD_GRID_COLS}`}>
              {queue.map((p) => (
                <li key={p.id}>
                  <ResolveForm
                    pendingId={p.id}
                    itemType={p.itemType}
                    row={p.row}
                    ownerName={p.ownerName ?? null}
                    candidates={p.candidates}
                  />
                </li>
              ))}
            </ul>)
          )}
        </section>
      )}
    </div>
  );
}
