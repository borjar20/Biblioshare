"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  listClubDirectory,
  type ClubDirectoryPage,
  type DirectoryFilter,
  type DirectoryMember,
} from "@/lib/clubs/directory";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/ui/icons";

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// joined_at es timestamptz; el mes/año basta y evita el desfase de zona.
function monthYear(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

const FILTERS: DirectoryFilter[] = ["all", "team", "active", "new"];

// Directorio de miembros (frame 9): abierto a todo miembro, SOLO LECTURA. Las
// acciones de moderar viven en Gestión; aquí solo se mira quién está y desde
// cuándo, y se salta a su perfil.
export function MemberDirectory({
  clubId,
  clubSlug,
  clubName,
  initial,
  canModerate,
  viewerId,
}: {
  clubId: string;
  clubSlug: string;
  clubName: string;
  initial: ClubDirectoryPage;
  canModerate: boolean;
  viewerId: string;
}) {
  const t = useTranslations("club");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(initial);
  const [page, setPage] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Debounce del buscador: el filtrado es server-side (P5).
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Recarga la página 0 al cambiar filtro/búsqueda. Salta el primer montaje:
  // `initial` ya es (all, "") — no re-consultar lo que ya tenemos.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    startTransition(async () => {
      const fresh = await listClubDirectory(clubId, { filter, search, page: 0 });
      setData(fresh);
      setPage(0);
    });
  }, [clubId, filter, search]);

  function loadMore() {
    const next = page + 1;
    startTransition(async () => {
      const more = await listClubDirectory(clubId, { filter, search, page: next });
      setData((prev) => ({ ...more, rows: [...prev.rows, ...more.rows] }));
      setPage(next);
    });
  }

  const filterLabel: Record<DirectoryFilter, string> = {
    all: `${t("directoryFilterAll")} · ${data.allTotal}`,
    team: `${t("directoryFilterTeam")} · ${data.teamTotal}`,
    active: t("directoryFilterActive"),
    new: t("directoryFilterNew"),
  };
  const hasMore = data.rows.length < data.rowsTotal;
  const showMainHeading = filter === "all";

  return (
    <div className="flex flex-col gap-4">
      {/* Topbar del frame 9: «‹» + Miembros + «club · N», y «⊕» invitar solo
          para moderación (lleva a Gestión, donde vive la acción). */}
      <div className="flex items-center gap-2.5">
        <Link
          href={`/club/${clubSlug}`}
          aria-label={t("directoryBack")}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-sm font-semibold text-foreground">
            {t("directoryTitle")}
          </h1>
          <p className="truncate font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
            {clubName} · {data.allTotal}
          </p>
        </div>
        {canModerate && (
          <Link
            href={`/club/${clubSlug}?tab=gestion`}
            aria-label={t("directoryInvite")}
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
          >
            <PlusIcon className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("directorySearch")}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </div>

      {/* Segmentado de filtros (.seg2 del frame 9). */}
      <div className="flex rounded-lg bg-surface-muted p-[3px]">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${
              filter === f
                ? "bg-surface text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {filterLabel[f]}
          </button>
        ))}
      </div>

      {data.team.length > 0 && (
        <section className="flex flex-col">
          <h2 className="mb-0.5 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("directorySectionTeam")}
          </h2>
          {data.team.map((m) => (
            <DirectoryRow key={m.userId} member={m} viewerId={viewerId} t={t} />
          ))}
        </section>
      )}

      <section className="flex flex-col">
        {showMainHeading && (
          <h2 className="mb-0.5 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("directorySectionMembers")} · {data.rowsTotal}
          </h2>
        )}
        {data.rows.length === 0 && data.team.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t("directoryEmpty")}</p>
        ) : (
          data.rows.map((m) => (
            <DirectoryRow key={m.userId} member={m} viewerId={viewerId} t={t} />
          ))
        )}

        {hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="mt-3 text-center font-mono text-[10.5px] tracking-wide text-accent uppercase hover:underline disabled:opacity-60"
          >
            {t("directoryShowing", { shown: data.rows.length, total: data.rowsTotal })}
            {" · "}
            {t("directoryLoadMore")}
          </button>
        )}
      </section>
    </div>
  );
}

function DirectoryRow({
  member,
  viewerId,
  t,
}: {
  member: DirectoryMember;
  viewerId: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const name = member.displayName || member.username;
  const date = monthYear(member.joinedAt);
  const prefix =
    member.role === "owner"
      ? t("directoryFounded", { date })
      : t("directorySince", { date });
  const activities =
    member.activityCount > 0
      ? t("directoryActivities", { count: member.activityCount })
      : t("directoryNoActivities");

  return (
    <Link
      href={`/u/${member.username}`}
      className="flex items-center gap-3 border-t border-border py-2.5 transition-colors first:border-t-0 hover:bg-surface-muted"
    >
      <UserAvatar name={name} avatarUrl={member.avatarUrl} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
          <span className="truncate">{name}</span>
          {member.role === "owner" && (
            <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[9px] tracking-wide text-accent uppercase">
              {t("directoryOwnerChip")}
            </span>
          )}
          {member.role === "moderator" && (
            <span className="shrink-0 rounded-full bg-green/15 px-2 py-0.5 font-mono text-[9px] tracking-wide text-green uppercase">
              {t("directoryModChip")}
            </span>
          )}
          {member.userId === viewerId && (
            <span className="shrink-0 rounded border border-accent/40 px-1.5 font-mono text-[9px] text-accent">
              {t("directoryYou")}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
          {prefix} · {activities}
        </div>
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
