import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import type { FollowCounts } from "@/lib/social/follows";
import { EditProfileForm } from "./edit-profile-form";
import { ProfileSettingsSheet } from "@/app/u/[username]/profile-settings-sheet";
import { UserAvatar } from "@/components/social/user-avatar";
import { ImageZoom } from "@/components/ui/image-zoom";

// Cabecera compacta del mockup "IA nueva": (avatar + nombre/@user + acción) →
// counts → bio → chips con punto de color por tipo.
export async function ProfileHeader({
  profile,
  stats,
  isOwner,
  counts,
  followButton,
  safetyActions,
}: {
  profile: Profile;
  stats: LibraryStats;
  isOwner: boolean;
  counts: FollowCounts;
  followButton?: ReactNode;
  safetyActions?: ReactNode;
}) {
  const t = await getTranslations("profile");
  const tSocial = await getTranslations("social");
  const tAdmin = await getTranslations("admin");
  const name = profile.displayName || profile.username;
  const memberSinceYear = new Date(profile.createdAt).getFullYear();
  const basePath = `/u/${profile.username}`;
  // Con foto se puede ampliar; con iniciales no hay nada que ampliar.
  const avatar = (size: number) =>
    profile.avatarUrl ? (
      <ImageZoom
        src={profile.avatarUrl}
        alt={name}
        className="block rounded-full"
      >
        <UserAvatar name={name} avatarUrl={profile.avatarUrl} size={size} />
      </ImageZoom>
    ) : (
      <UserAvatar name={name} avatarUrl={null} size={size} />
    );

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <div className="flex items-start gap-4 lg:gap-[18px]">
        {/* Avatar 60 en móvil, 84 en escritorio (G/H). Es puramente
            presentacional y sin estado, así que duplicarlo por breakpoint es el
            caso SEGURO de la regla de los dos árboles — a diferencia del botón
            de seguir o la hoja de editar, que van una sola vez más abajo. */}
        <div className="lg:hidden">{avatar(60)}</div>
        <div className="hidden lg:block">{avatar(84)}</div>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-2 lg:flex-nowrap lg:gap-4">
          <div className="flex min-w-[55%] flex-col lg:min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-baseline lg:gap-2.5">
              <h1 className="font-serif text-[22px] leading-tight font-semibold lg:text-[28px]">
                {name}
              </h1>
              <span className="mt-1 font-mono text-[12.5px] text-muted-foreground lg:mt-0">
                @{profile.username}
              </span>
            </div>
            {/* En escritorio la bio y los counts viven bajo el nombre, dentro
                de la columna de texto (frame G). En móvil van a lo ancho, más
                abajo (frame A). Un solo nodo de cada, conmutado por breakpoint. */}
            {profile.bio && (
              <p className="mt-2 hidden max-w-[540px] text-sm text-muted-foreground lg:block">
                {profile.bio}
              </p>
            )}
            <div className="mt-2 hidden flex-wrap items-center gap-2 text-sm lg:flex">
              <Counts basePath={basePath} counts={counts} tSocial={tSocial} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {followButton}
            {safetyActions}
            {isOwner && (
              <>
                <EditProfileForm profile={profile} />
                <ProfileSettingsSheet
                  username={profile.username}
                  isPublic={profile.isPublic}
                  isAdmin={profile.role === "admin"}
                  adminLabel={tAdmin("navLabel")}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm lg:hidden">
        <Counts basePath={basePath} counts={counts} tSocial={tSocial} />
      </div>

      {profile.bio && (
        <p className="max-w-prose text-sm text-muted-foreground lg:hidden">
          {profile.bio}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-type-book" />
          {t("statsBooks", { count: stats.book })}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-type-series"
          />
          {t("statsSeries", { count: stats.series })}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-type-movie"
          />
          {t("statsFilms", { count: stats.movie })}
        </span>
        <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {t("memberSince", { year: memberSinceYear })}
        </span>
      </div>
    </div>
  );
}

// Seguidores · siguiendo. Enlaces sin estado, así que aparecer en las dos ramas
// del header (móvil a lo ancho / escritorio bajo el nombre) es seguro.
function Counts({
  basePath,
  counts,
  tSocial,
}: {
  basePath: string;
  counts: FollowCounts;
  tSocial: (key: string, values?: Record<string, number>) => string;
}) {
  return (
    <>
      <Link
        href={`${basePath}/seguidores`}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="font-semibold text-foreground">{counts.followers}</span>{" "}
        {tSocial("followersLabel", { count: counts.followers })}
      </Link>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <Link
        href={`${basePath}/siguiendo`}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="font-semibold text-foreground">{counts.following}</span>{" "}
        {tSocial("followingLabel")}
      </Link>
    </>
  );
}
