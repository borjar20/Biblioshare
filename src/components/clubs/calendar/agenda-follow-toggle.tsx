"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/components/ui/icons";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { eventFollowReducer } from "@/lib/clubs/activities/event-follow-optimistic";
import {
  followClubEvent,
  unfollowClubEvent,
} from "@/lib/clubs/activities/event-follow-actions";

// Seguir/dejar de seguir desde la fila de la agenda, sin abrir la ficha.
//
// No reutiliza EventFollowButton: ese es un CTA con etiqueta, contador y mensaje
// de ayuda, y aquí solo cabe un icono a la derecha de la fila. Lo que SÍ comparten
// es el reducer optimista, que es donde vive la lógica.
export function AgendaFollowToggle({
  activityId,
  title,
  following,
}: {
  activityId: string;
  title: string;
  following: boolean;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const [fallo, setFallo] = useState(false);
  const { state, isPending, run } = useOptimisticAction({
    // El contador no se pinta aquí, pero el reducer es el mismo: se le pasa un 0 y
    // se ignora su resultado. Duplicar un reducer «sin contador» sería tener dos
    // sitios donde arreglar el mismo bug.
    state: { following, followersCount: 0, remindMinutesBefore: null },
    reducer: eventFollowReducer,
  });

  function toggle() {
    // La doble pulsación se corta AQUÍ, no con el atributo `disabled`. Ver abajo.
    if (isPending) return;
    setFallo(false);
    const iba = state.following;
    run({ type: iba ? "unfollow" : "follow" }, async () => {
      const result = iba
        ? await unfollowClubEvent(activityId)
        : await followClubEvent(activityId);
      if (!result.ok) {
        setFallo(true);
        throw new Error(result.code);
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // `aria-disabled` en vez de `disabled` MIENTRAS GUARDA, y no es un detalle:
      // deshabilitar un elemento que tiene el foco lo BLUREA, y al volver no se
      // recupera. En una lista eso deja a quien navega con teclado en el body,
      // habiendo perdido su sitio entre las filas. Se vio con un test de teclado
      // que fallaba justo aquí. Con aria-disabled el botón sigue siendo enfocable,
      // la tecnología asistiva sabe que está inerte, y la doble pulsación la corta
      // la guarda de `toggle()` (más la idempotencia de la RPC detrás).
      aria-disabled={isPending}
      aria-pressed={state.following}
      // El título del evento va en el nombre accesible: en una agenda de cinco
      // filas, cinco botones que solo dicen «Seguir» son indistinguibles.
      aria-label={`${state.following ? t("eventUnfollow") : t("eventFollow")}: ${title}`}
      className={`grid w-12 shrink-0 place-items-center border-l border-border transition-colors hover:bg-surface-muted aria-disabled:opacity-50 ${
        state.following ? "text-accent" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <BellIcon className="h-4 w-4" aria-hidden />
      {fallo && <span className="sr-only">{t("eventFollowError")}</span>}
    </button>
  );
}
