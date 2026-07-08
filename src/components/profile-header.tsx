import { getTranslations } from "next-intl/server";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { EditProfileForm } from "./edit-profile-form";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function ProfileHeader({
  profile,
  stats,
  isOwner,
}: {
  profile: Profile;
  stats: LibraryStats;
  isOwner: boolean;
}) {
  const t = await getTranslations("profile");
  const name = profile.displayName || profile.username;
  const memberSinceYear = new Date(profile.createdAt).getFullYear();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-muted">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not in next/image remotePatterns
              <img
                src={profile.avatarUrl}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
                {initials(name)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <span className="text-sm text-muted-foreground">@{profile.username}</span>
            </div>
            {profile.bio && (
              <p className="max-w-prose text-sm text-muted-foreground">{profile.bio}</p>
            )}
          </div>
        </div>

        {isOwner && <EditProfileForm profile={profile} />}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground">
          {t("statsBooks", { count: stats.book })}
        </span>
        <span className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground">
          {t("statsSeries", { count: stats.series })}
        </span>
        <span className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground">
          {t("statsFilms", { count: stats.movie })}
        </span>
        <span className="rounded-full bg-surface-muted px-3 py-1.5 text-xs text-muted-foreground">
          {t("memberSince", { year: memberSinceYear })}
        </span>
      </div>
    </div>
  );
}
