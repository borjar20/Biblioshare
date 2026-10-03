import { getTranslations } from "next-intl/server";
import { listMyClubs, discoverPublicClubs } from "@/lib/clubs/clubs";
import { getClubUnreadCounts } from "@/lib/clubs/unread";
import { ClubCard } from "@/components/clubs/club-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon, UsersIcon } from "@/components/ui/icons";
import { CARD_GRID_COLS } from "@/lib/ui/layout";

// Both entry points use the same request-scoped club lists and permissions.
export async function ClubLists({ query }: { query?: string }) {
  const t = await getTranslations("club");
  const [myClubs, unread, discovered] = await Promise.all([
    listMyClubs(), getClubUnreadCounts(), discoverPublicClubs(query || undefined),
  ]);
  const mine = myClubs.filter(club => club.viewerStatus === "active");
  const invited = myClubs.filter(club => club.viewerStatus === "invited");

  return <>
    {invited.length > 0 && <section className="flex flex-col gap-3">
      <h2 className="label-section">{t("myInvites")}</h2>
      <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>{invited.map(club => <ClubCard key={club.id} club={club}/>)}</div>
    </section>}
    <section className="flex flex-col gap-3">
      <h2 className="label-section">{t("myClubs")}</h2>
      {mine.length === 0
        ? <EmptyState variant="panel" glyph={<UsersIcon className="h-5 w-5"/>} title={t("empty")} message={t("emptyBody")}/>
        : <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>{mine.map(club => <ClubCard key={club.id} club={club} unread={unread.get(club.id) ?? 0}/>)}</div>}
    </section>
    <section className="flex flex-col gap-3">
      <h2 className="label-section">{t("discover")}</h2>
      {discovered.length === 0
        ? <EmptyState variant="panel" glyph={<SearchIcon className="h-5 w-5"/>} title={t("emptyDiscover")} message={query ? t("emptyDiscoverBody") : t("emptyDiscoverNoQuery")}/>
        : <div className={`grid gap-3.5 ${CARD_GRID_COLS}`}>{discovered.map(club => <ClubCard key={club.id} club={club}/>)}</div>}
    </section>
  </>;
}
