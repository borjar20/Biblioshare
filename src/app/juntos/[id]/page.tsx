import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getJointViewingPage } from "@/lib/social/joint-viewings";
import { itemHref } from "@/lib/catalog/item-href";
import { SpineCover } from "@/components/social/spine-cover";
import { UserAvatar } from "@/components/social/user-avatar";
import { JointInviteResponse } from "@/components/social/joint-invite-response";
import { RouteMessages } from "@/components/route-messages";
import { SHELL_READ } from "@/lib/ui/layout";
import { loginHref } from "@/lib/auth/safe-next";

// Página de un visionado conjunto (#1220): donde aterriza el aviso de
// invitación. Quién está, y —si quien mira está invitado— aceptar o decir «No
// fui yo». Lectura filtrada por RLS (miembros y quien ve el post conjunto), así
// que NO se cachea (regla #437): ruta dinámica, cliente de la petición.
export const metadata: Metadata = {
  title: "Juntos — Biblioshare",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JointViewingRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/juntos/${id}`));

  const supabase = await createClient();
  const page = await getJointViewingPage(supabase, user.id, id);
  if (!page) notFound();

  const t = await getTranslations("joint");
  const creatorName = page.createdBy ? page.createdBy.displayName || page.createdBy.username : null;
  const visibleMembers = page.members.filter((m) => m.status !== "declined");

  return (
    <RouteMessages ns={["joint"]}>
      <div className={`mx-auto w-full ${SHELL_READ} flex-1 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
        <article className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 shadow-card">
          <div className="flex gap-4">
            <Link href={itemHref(page.itemType, page.itemId)} className="w-[72px] shrink-0">
              <SpineCover coverUrl={page.itemCoverUrl} title={page.itemTitle} className="aspect-[2/3] w-[72px]" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="label-section">{t("eyebrow")}</p>
              <h1 className="mt-1 font-serif text-xl leading-tight font-semibold">
                <Link href={itemHref(page.itemType, page.itemId)} className="hover:underline">
                  {page.itemTitle}
                </Link>
              </h1>
              {creatorName && (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t("createdBy", { name: creatorName, itemType: page.itemType })}
                </p>
              )}
              {page.watchedOn && (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{t("watchedOn", { date: new Date(page.watchedOn) })}</p>
              )}
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="label-section">{t("membersTitle")}</h2>
            <ul className="flex flex-col gap-2">
              {visibleMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 text-sm">
                  <UserAvatar name={m.displayName || m.username} avatarUrl={m.avatarUrl} size={28} />
                  <Link href={`/u/${m.username}`} className="min-w-0 flex-1 truncate hover:underline">
                    {m.displayName || m.username}
                  </Link>
                  <span className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
                    {t(`status.${m.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {page.viewerStatus === "invited" ? (
            <JointInviteResponse
              viewingId={page.id}
              itemType={page.itemType}
              itemHref={itemHref(page.itemType, page.itemId)}
              watchedOn={page.watchedOn}
              linkablePasses={page.linkablePasses}
            />
          ) : page.viewerStatus === "accepted" ? (
            <p className="text-sm text-muted-foreground">
              {t.rich("acceptedHint", {
                link: (chunks) => (
                  <Link href={itemHref(page.itemType, page.itemId)} className="text-foreground underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : page.viewerStatus === "declined" ? (
            <p className="text-sm text-muted-foreground">{t("declinedHint")}</p>
          ) : null}
        </article>
      </div>
    </RouteMessages>
  );
}
