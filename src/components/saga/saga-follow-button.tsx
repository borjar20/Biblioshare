"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { followSaga, unfollowSaga } from "@/lib/sagas/follow-actions";

// Isla cliente del hero de saga: mismo patrón que HeroStatusOrFollow/useFollow
// (item), pero autocontenido (sin contexto de estado de biblioteca — seguir
// una saga no tiene "pase"). useOptimistic evita el parpadeo entre el click y
// la revalidación del server action.
//
// Dos variantes:
// - `full` (default): el botón grande del hero de la ficha.
// - `icon`: el cuadrito de 25 px de la esquina de la tarjeta del índice
//   (mockup «Explorar sagas · A Denso»). La decisión de esa maqueta es que la
//   tarjeta INFORMA, no vende: seguir baja a un icono que solo aparece al
//   pasar el ratón o al recibir foco de teclado, y se queda fijo (✓ verde) si
//   ya la sigues. En táctil no hay hover, así que ahí es visible siempre.
export function SagaFollowButton({
  sagaId,
  isFollowing,
  variant = "full",
}: {
  sagaId: string;
  isFollowing: boolean;
  variant?: "full" | "icon";
}) {
  const t = useTranslations("saga");
  const tIndex = useTranslations("sagaIndex");
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isFollowing);

  function toggle() {
    startTransition(async () => {
      setOptimistic(!optimistic);
      if (optimistic) await unfollowSaga(sagaId);
      else await followSaga(sagaId);
    });
  }

  if (variant === "icon") {
    const label = optimistic ? tIndex("followingAria") : tIndex("followAria");
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-label={label}
        title={label}
        aria-pressed={optimistic}
        className={
          optimistic
            ? "absolute top-2 right-2 grid h-[25px] w-[25px] place-items-center rounded-[7px] border border-green/40 bg-green/10 text-[13px] leading-none text-green transition-opacity disabled:opacity-60"
            : // opacity-0 (no `hidden`): sigue siendo enfocable con teclado y
              // visible para lectores de pantalla. En <sm no hay hover: fijo.
              "absolute top-2 right-2 grid h-[25px] w-[25px] place-items-center rounded-[7px] border border-border bg-surface-muted text-[13px] leading-none text-muted-foreground opacity-100 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60 sm:opacity-0"
        }
      >
        {optimistic ? "✓" : "＋"}
      </button>
    );
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
