import { getTranslations } from "next-intl/server";
import type { ProfileIdentity } from "@/lib/profile/get-profile-by-username";
import type { FollowState } from "@/lib/social/follows";
import { UserAvatar } from "./user-avatar";
import { FollowButton } from "./follow-button";
import { LockIcon } from "@/components/ui/icons";
import { ProfileSafetyActions } from "./profile-safety-actions";
import type { BlockState } from "@/lib/social/block-state";

// Stub de perfil PRIVADO (modelo Instagram): identidad + solicitar-seguir, con
// el contenido oculto tras un aviso de "cuenta privada". Se renderiza cuando la
// fila completa del perfil no es visible para el visitante (no dueño ni seguidor
// aceptado), pero su identidad sí (vía profile_identities).
export async function PrivateProfileStub({
  identity,
  followState,
  viewerLoggedIn,
  blockState = "none",
}: {
  identity: ProfileIdentity;
  followState: FollowState;
  viewerLoggedIn: boolean;
  blockState?: BlockState;
}) {
  const t = await getTranslations("social");
  const name = identity.displayName || identity.username;
  const isBlocked = blockState === "blocked";

  // Centrado, no cabecera: aquí no hay contenido debajo que encabezar — la
  // identidad ES la pantalla (Paper - Estados.html, frame 1).
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
      <UserAvatar name={name} avatarUrl={identity.avatarUrl} size={76} />

      <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight">
        {name}
      </h1>
      <span className="font-mono text-xs text-muted-foreground">
        @{identity.username}
      </span>

      {identity.bio && (
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          {identity.bio}
        </p>
      )}

      <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-muted px-3.5 py-1.5 text-xs text-muted-foreground">
        <LockIcon className="h-3.5 w-3.5" />
        {isBlocked ? t("blockedTitle") : t("privateTitle")}
      </span>

      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        {isBlocked ? t("blockedDescription") : t("privateDescription")}
      </p>

      <div className="mt-5">
        {isBlocked ? (
          <ProfileSafetyActions targetUserId={identity.userId} initialState="blocked" />
        ) : (
          <FollowButton
            targetUserId={identity.userId}
            targetIsPublic={false}
            state={followState}
            viewerLoggedIn={viewerLoggedIn}
          />
        )}
      </div>
    </div>
  );
}
