"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { loginHref } from "@/lib/auth/safe-next";
import { followUser, unfollowUser } from "@/lib/social/actions";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { followReducer } from "@/lib/social/follow-optimistic";
import type { FollowState } from "@/lib/social/follows";

// Botón Seguir / Solicitar / Siguiendo / Solicitado. El estado real lo devuelve
// el servidor tras revalidar (las server actions hacen revalidatePath); encima,
// useOptimisticAction adelanta el cambio al instante y revierte en error.
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
  const pathname = usePathname();
  const {
    state: current,
    isPending,
    failed,
    run,
  } = useOptimisticAction({ state, reducer: followReducer });

  if (state === "self") return null;

  if (!viewerLoggedIn) {
    return (
      <Link href={loginHref(pathname)} className={buttonVariants("primary")}>
        {targetIsPublic ? t("follow") : t("requestFollow")}
      </Link>
    );
  }

  // La server action se elige por el estado ACTUAL (pre-clic): si no sigues, seguir;
  // si sigues o has solicitado, dejar de seguir / cancelar.
  const toggle = () =>
    run({ type: "toggle", targetIsPublic }, () =>
      current === "none" ? followUser(targetUserId) : unfollowUser(targetUserId),
    );

  const label =
    current === "accepted"
      ? t("following")
      : current === "pending"
        ? t("requested")
        : targetIsPublic
          ? t("follow")
          : t("requestFollow");

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={current === "none" ? "primary" : "secondary"}
        disabled={isPending}
        onClick={toggle}
      >
        {label}
      </Button>
      {failed && (
        <p role="alert" className="max-w-48 text-right text-xs text-status-dropped">
          {t("actionError")}
        </p>
      )}
    </div>
  );
}
