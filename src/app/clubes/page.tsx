import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { listMyClubs, discoverPublicClubs } from "@/lib/clubs/clubs";
import { getClubUnreadCounts } from "@/lib/clubs/unread";
import { ClubCard } from "@/components/clubs/club-card";
import { ClubSearch } from "@/components/clubs/club-search";
import { ClubCreateToggle } from "@/components/clubs/club-create-toggle";
import { CARD_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Clubes — Biblioshare",
};

// Server Component (#438): antes era `"use client"` y lanzaba sus lecturas en
// `useEffect`, lo que (1) dejaba el HTML sin ningún club, (2) despachaba las
// server actions de una en una —el cliente no las paraleliza— y (3) arrastraba
// `@supabase/supabase-js` (252 KB, el mayor chunk del build) al navegador por el
// único `import "@/lib/supabase/client"` del repo. Ahora las tres lecturas van
// en un `Promise.all` de servidor, el HTML llega con los clubes dentro y el
// chunk de Supabase desaparece del bundle. El buscador y el botón de crear
// quedan como islas de cliente (ClubSearch sobre `?q=`, ClubCreateToggle).
export default async function ClubesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/clubes"));

  const { q } = await searchParams;
  const t = await getTranslations("club");

  const [myClubs, unread, discovered] = await Promise.all([
    listMyClubs(),
    getClubUnreadCounts(),
    discoverPublicClubs(q || undefined),
  ]);

  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <ClubCreateToggle userId={user.id} title={t("navLabel")} createLabel={t("create")} />

      {/* El buscador va antes que las listas, como en el handoff: buscar un club
          es la acción más frecuente de quien llega sin uno concreto en mente. */}
      <ClubSearch placeholder={t("searchPlaceholder")} initialQuery={q ?? ""} />

      <section className="flex flex-col gap-3">
        <h2 className="label-section">{t("myClubs")}</h2>
        {myClubs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>
            {myClubs.map((club) => (
              <ClubCard
                key={club.id}
                club={{ ...club, viewerStatus: "active" }}
                unread={unread.get(club.id) ?? 0}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-section">{t("discover")}</h2>
        {discovered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyDiscover")}</p>
        ) : (
          <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>
            {discovered.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
