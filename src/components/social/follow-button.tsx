"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { followUser, unfollowUser } from "@/lib/social/actions";
import type { FollowState } from "@/lib/social/follows";

// Botón Seguir / Solicitar / Siguiendo / Solicitado. El estado real lo devuelve
// el servidor tras revalidar (las server actions hacen revalidatePath), así que
// el label se deriva del prop `state`, no de estado local optimista.
export function FollowButton({
  targetUserId,
  targetIsPublic,
  state,
  viewerLoggedIn,
}: {
  targetUserId: string;
  targetIsPublic: boolean;
  state: FollowState;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("social");
  const [isPending, startTransition] = useTransition();

  if (state === "self") return null;

  if (!viewerLoggedIn) {
    return (
      <Link href="/login" className={buttonVariants("primary")}>
        {targetIsPublic ? t("follow") : t("requestFollow")}
      </Link>
    );
  }

  if (state === "accepted") {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => startTransition(() => unfollowUser(targetUserId))}
      >
        {t("following")}
      </Button>
    );
  }

  if (state === "pending") {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => startTransition(() => unfollowUser(targetUserId))}
      >
        {t("requested")}
      </Button>
    );
  }

  // state === "none"
  return (
    <Button
      type="button"
      variant="primary"
      disabled={isPending}
      onClick={() => startTransition(() => followUser(targetUserId))}
    >
      {targetIsPublic ? t("follow") : t("requestFollow")}
    </Button>
  );
}
