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
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon, UsersIcon } from "@/components/ui/icons";
import { CARD_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";

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

  const mine = myClubs.filter((c) => c.viewerStatus === "active");
  const invited = myClubs.filter((c) => c.viewerStatus === "invited");

  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <ClubCreateToggle userId={user.id} title={t("navLabel")} createLabel={t("create")} />

      {/* El buscador va antes que las listas, como en el handoff: buscar un club
          es la acción más frecuente de quien llega sin uno concreto en mente. */}
      <ClubSearch placeholder={t("searchPlaceholder")} initialQuery={q ?? ""} />

      {/* Las invitaciones van ANTES que "Mis clubes": son lo único de esta
          pantalla que te pide una respuesta. Y son la razón de que la sección
          exista — un club privado al que te invitan no sale en "Descubrir"
          (solo trae públicos), así que sin esto la única puerta de entrada era
          la notificación de la campana, y pasarla de largo dejaba la
          invitación inalcanzable. */}
      {invited.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="label-section">{t("myInvites")}</h2>
          <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>
            {invited.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="label-section">{t("myClubs")}</h2>
        {/* Dos vacíos con MOTIVOS distintos, y por eso dos textos distintos
            (F3-015): «no tienes clubes» es un principio y ofrece la sección de
            abajo; «no se encontraron» puede ser una búsqueda que no casa o que
            de verdad no haya ninguno público, y ahí la salida no es la misma.
            Antes los tres eran la misma frase gris suelta. */}
        {mine.length === 0 ? (
          <EmptyState
            variant="panel"
            glyph={<UsersIcon className="h-5 w-5" />}
            title={t("empty")}
            message={t("emptyBody")}
          />
        ) : (
          <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>
            {mine.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                unread={unread.get(club.id) ?? 0}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-section">{t("discover")}</h2>
        {discovered.length === 0 ? (
          <EmptyState
            variant="panel"
            glyph={<SearchIcon className="h-5 w-5" />}
            title={t("emptyDiscover")}
            message={q ? t("emptyDiscoverBody") : t("emptyDiscoverNoQuery")}
          />
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
