import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import type { FollowCounts } from "@/lib/social/follows";
import { EditProfileForm } from "./edit-profile-form";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  BookIcon,
  FilmIcon,
  SeriesIcon,
  UserIcon,
} from "@/components/ui/icons";

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-4">
          <UserAvatar name={name} avatarUrl={profile.avatarUrl} size={64} />
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <span className="font-mono text-xs text-muted-foreground">
                @{profile.username}
              </span>
            </div>
            {profile.bio && (
              <p className="max-w-prose text-sm text-muted-foreground">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {followButton}
          {isOwner && <EditProfileForm profile={profile} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link
          href={`${basePath}/seguidores`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-semibold text-foreground">
            {counts.followers}
          </span>{" "}
          {tSocial("followersLabel", { count: counts.followers })}
        </Link>
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

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground">
          <BookIcon className="h-3.5 w-3.5 text-type-book" />
          {t("statsBooks", { count: stats.book })}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground">
          <SeriesIcon className="h-3.5 w-3.5 text-type-series" />
          {t("statsSeries", { count: stats.series })}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground">
          <FilmIcon className="h-3.5 w-3.5 text-type-movie" />
          {t("statsFilms", { count: stats.movie })}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 text-xs text-muted-foreground">
          <UserIcon className="h-3.5 w-3.5" />
          {t("memberSince", { year: memberSinceYear })}
        </span>
      </div>
    </div>
  );
}
