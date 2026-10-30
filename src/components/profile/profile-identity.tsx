import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import type { FollowCounts } from "@/lib/social/follows";
import { EditProfileForm } from "@/components/edit-profile-form";
import { buttonVariants } from "@/components/ui/button";
import { GearIcon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/social/user-avatar";
import { ImageZoom } from "@/components/ui/image-zoom";

// Identidad del perfil (spec §3.1): avatar montado sobre la cabecera, nombre,
// bio, contadores y acciones. Sustituye a `profile-header.tsx`; las cifras y la
// mascota viven ahora en sus propios bloques.
export async function ProfileIdentity({
  profile,
  isOwner,
  counts,
  followButton,
  safetyActions,
}: {
  profile: Profile;
  isOwner: boolean;
  counts: FollowCounts;
  followButton?: ReactNode;
  safetyActions?: ReactNode;
}) {
  const t = await getTranslations("profile");
  const tVisual = await getTranslations("profile.visual");
  const tSocial = await getTranslations("social");
  const name = profile.displayName || profile.username;
  const memberSinceYear = new Date(profile.createdAt).getFullYear();
  const basePath = `/u/${profile.username}`;
  // Con foto se puede ampliar; con iniciales no hay nada que ampliar.
  const avatar = (size: number) =>
    profile.avatarUrl ? (
      <ImageZoom src={profile.avatarUrl} alt={name} className="block rounded-full">
        <UserAvatar name={name} avatarUrl={profile.avatarUrl} size={size} />
      </ImageZoom>
    ) : (
      <UserAvatar name={name} avatarUrl={null} size={size} />
    );

  return (
    // Una sola rejilla y un solo nodo de acciones, reubicado por breakpoint: el
    // botón de seguir y la hoja de editar llevan estado, no se duplican.
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 lg:grid-cols-1 lg:gap-y-4">
      <div className="col-start-1 row-start-1 w-fit rounded-full border-4 border-background shadow-[0_8px_24px_rgba(0,0,0,.5)]">
        {/* El avatar es presentacional y sin estado: duplicarlo por breakpoint es seguro. */}
        <div className="lg:hidden">{avatar(84)}</div>
        <div className="hidden lg:block">{avatar(104)}</div>
      </div>

      <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center justify-end gap-2 self-end lg:col-start-1 lg:row-start-3 lg:justify-start">
        {followButton}
        {safetyActions}
        {isOwner && (
          <>
            <EditProfileForm profile={profile} />
            {/* Enlace a /ajustes: una pantalla de configuración se comparte,
                se marca y se vuelve a ella con atrás (F3-010). */}
            <Link
              href="/ajustes"
              aria-label={t("settings")}
              className={buttonVariants("secondary", "px-2.5")}
            >
              <GearIcon className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>

      <div className="col-span-2 row-start-2 min-w-0 lg:col-span-1">
        <h1 className="font-serif text-[28px] font-bold leading-[1.05] lg:text-[34px]">{name}</h1>
        <p className="mt-1 font-mono text-[12.5px] text-muted-foreground">
          @{profile.username} · {tVisual("memberSinceInline", { year: memberSinceYear })}
        </p>
        {profile.bio && (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">{profile.bio}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Counts basePath={basePath} counts={counts} tSocial={tSocial} />
        </div>
      </div>
    </div>
  );
}

// Seguidores · siguiendo. Enlaces sin estado.
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
