import { getTranslations } from "next-intl/server";
import type { ProfileIdentity } from "@/lib/profile/get-profile-by-username";
import type { FollowState } from "@/lib/social/follows";
import { UserAvatar } from "./user-avatar";
import { FollowButton } from "./follow-button";
import { LockIcon } from "@/components/ui/icons";

// Stub de perfil PRIVADO (modelo Instagram): identidad + solicitar-seguir, con
// el contenido oculto tras un aviso de "cuenta privada". Se renderiza cuando la
// fila completa del perfil no es visible para el visitante (no dueño ni seguidor
// aceptado), pero su identidad sí (vía profile_identities).
export async function PrivateProfileStub({
  identity,
  followState,
  viewerLoggedIn,
}: {
  identity: ProfileIdentity;
  followState: FollowState;
  viewerLoggedIn: boolean;
}) {
  const t = await getTranslations("social");
  const name = identity.displayName || identity.username;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-4">
          <UserAvatar name={name} avatarUrl={identity.avatarUrl} size={64} />
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <span className="text-sm text-muted-foreground">
                @{identity.username}
              </span>
            </div>
            {identity.bio && (
              <p className="max-w-prose text-sm text-muted-foreground">
                {identity.bio}
              </p>
            )}
          </div>
        </div>

        <FollowButton
          targetUserId={identity.userId}
          targetIsPublic={false}
          state={followState}
          viewerLoggedIn={viewerLoggedIn}
        />
      </div>

      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-4 py-10 text-center">
        <LockIcon className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{t("privateTitle")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("privateDescription")}
        </p>
      </div>
    </div>
  );
}
