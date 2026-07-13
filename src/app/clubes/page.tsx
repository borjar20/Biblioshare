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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ClubesPage() {
  const t = useTranslations("club");
  const [userId, setUserId] = useState<string | null>(null);
  const [myClubs, setMyClubs] = useState<ClubWithCount[]>([]);
  const [discovered, setDiscovered] = useState<(ClubWithCount & { viewerStatus: ClubMembershipStatus })[]>([]);
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    listMyClubs().then(setMyClubs);
    getClubUnreadCounts().then(setUnread);
    discoverPublicClubs().then(setDiscovered);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      discoverPublicClubs(query || undefined).then(setDiscovered);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (!userId) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {t("navLabel")}
        </h1>
        <Button type="button" onClick={() => setCreating((v) => !v)}>
          {t("create")}
        </Button>
      </div>

      {/* El buscador va antes que nada, como en el handoff: buscar un club es
          la acción más frecuente de quien llega aquí sin uno concreto en mente. */}
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full"
      />

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
        {myClubs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex flex-col gap-3.5">
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
        {discovered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyDiscover")}</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {discovered.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
