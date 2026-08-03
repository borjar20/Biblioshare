"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  listMyClubs,
  discoverPublicClubs,
  type ClubWithCount,
  type ClubMembershipStatus,
} from "@/lib/clubs/clubs";
import { getClubUnreadCounts } from "@/lib/clubs/unread";
import { ClubCard } from "@/components/clubs/club-card";
import { ClubForm } from "@/components/clubs/club-form";
import { ClubListSkeleton } from "@/components/clubs/club-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/ui/icons";
import { CARD_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";

export default function ClubesPage() {
  const t = useTranslations("club");
  const [userId, setUserId] = useState<string | null>(null);
  const [myClubs, setMyClubs] = useState<ClubWithCount[]>([]);
  const [discovered, setDiscovered] = useState<(ClubWithCount & { viewerStatus: ClubMembershipStatus })[]>([]);
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // Estos fetches son de cliente (useEffect): sin un flag de carga, el primer
  // render pintaría el mensaje "no hay clubes" con la lista aún vacía. Mientras
  // no resuelvan, se muestran skeletons.
  const [myClubsLoading, setMyClubsLoading] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    listMyClubs().then((clubs) => {
      setMyClubs(clubs);
      setMyClubsLoading(false);
    });
    getClubUnreadCounts().then(setUnread);
  }, []);

  useEffect(() => {
    // Cubre también la carga inicial (query = ""; discoverLoading arranca en
    // true). Durante la búsqueda vuelve a mostrar skeleton hasta que llegan los
    // nuevos resultados. El setState va dentro del timeout (no en el cuerpo del
    // efecto) para no disparar renders en cascada.
    const handle = setTimeout(() => {
      setDiscoverLoading(true);
      discoverPublicClubs(query || undefined).then((clubs) => {
        setDiscovered(clubs);
        setDiscoverLoading(false);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (!userId) return null;

  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {t("navLabel")}
        </h1>
        <Button
          type="button"
          className="px-3.5 py-1.5 text-xs"
          onClick={() => setCreating((v) => !v)}
        >
          + {t("create")}
        </Button>
      </div>

      {/* El buscador va antes que nada, como en el handoff: buscar un club es
          la acción más frecuente de quien llega aquí sin uno concreto en mente.
          Píldora estilo composer (radio 12px + lupa) como en el frame 1. */}
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl py-2.5 pl-10"
        />
      </div>

      {creating && (
        <ClubForm
          userId={userId}
          mode="create"
          onCreated={(club) => {
            // Acabas de crearlo: eres su único miembro.
            setMyClubs((prev) => [{ ...club, memberCount: 1 }, ...prev]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("myClubs")}
        </h2>
        {myClubsLoading ? (
          <ClubListSkeleton count={2} />
        ) : myClubs.length === 0 ? (
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
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("discover")}
        </h2>
        {discoverLoading ? (
          <ClubListSkeleton count={2} />
        ) : discovered.length === 0 ? (
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
