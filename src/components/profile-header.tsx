import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import type { FollowCounts } from "@/lib/social/follows";
import { EditProfileForm } from "./edit-profile-form";
import { UserAvatar } from "@/components/social/user-avatar";

// Cabecera compacta del mockup "IA nueva": (avatar + nombre/@user + acción) →
// counts → bio → chips con punto de color por tipo.
export async function ProfileHeader({
  profile,
  stats,
  isOwner,
  counts,
  followButton,
}: {
  profile: Profile;
  stats: LibraryStats;
  isOwner: boolean;
  counts: FollowCounts;
  followButton?: ReactNode;
}) {
  const t = await getTranslations("profile");
  const tSocial = await getTranslations("social");
  const name = profile.displayName || profile.username;
  const memberSinceYear = new Date(profile.createdAt).getFullYear();
  const basePath = `/u/${profile.username}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <UserAvatar name={name} avatarUrl={profile.avatarUrl} size={60} />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="font-serif text-[22px] leading-tight font-semibold">
              {name}
            </h1>
            <span className="mt-1 font-mono text-[12.5px] text-muted-foreground">
              @{profile.username}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {followButton}
            {isOwner && <EditProfileForm profile={profile} />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`${basePath}/seguidores`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-semibold text-foreground">
            {counts.followers}
          </span>{" "}
          {tSocial("followersLabel", { count: counts.followers })}
        </Link>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <Link
          href={`${basePath}/siguiendo`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-semibold text-foreground">
            {counts.following}
          </span>{" "}
          {tSocial("followingLabel")}
        </Link>
      </div>

      {profile.bio && (
        <p className="max-w-prose text-sm text-muted-foreground">
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
