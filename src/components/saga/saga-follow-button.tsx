"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { followSaga, unfollowSaga } from "@/lib/sagas/follow-actions";

// Isla cliente del hero de saga: mismo patrón que HeroStatusOrFollow/useFollow
// (item), pero autocontenido (sin contexto de estado de biblioteca — seguir
// una saga no tiene "pase"). useOptimistic evita el parpadeo entre el click y
// la revalidación del server action.
export function SagaFollowButton({
  sagaId,
  isFollowing,
}: {
  sagaId: string;
  isFollowing: boolean;
}) {
  const t = useTranslations("saga");
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isFollowing);

  function toggle() {
    startTransition(async () => {
      setOptimistic(!optimistic);
      if (optimistic) await unfollowSaga(sagaId);
      else await followSaga(sagaId);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={
        optimistic
          ? "inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60"
          : "inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
      }
    >
      {optimistic ? t("following") : t("follow")}
    </button>
  );
}
