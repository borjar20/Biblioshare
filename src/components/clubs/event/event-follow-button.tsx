"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { BellIcon, CheckIcon } from "@/components/ui/icons";
import { loginHref } from "@/lib/auth/safe-next";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import {
  eventFollowReducer,
  type EventFollowState,
} from "@/lib/clubs/activities/event-follow-optimistic";
import { canFollowEvent, type EventState } from "@/lib/clubs/activities/event-state";
import {
  followClubEvent,
  unfollowClubEvent,
} from "@/lib/clubs/activities/event-follow-actions";

// Botón de seguir/dejar de seguir un evento, con los estados de §15. El estado
// real lo devuelven las props revalidadas del servidor; useOptimisticAction
// adelanta el cambio y REVIERTE solo en error, así que el botón nunca se queda
// diciendo «Siguiendo» cuando el backend falló.

export function EventFollowButton({
  activityId,
  eventState,
  followState,
  viewerIsMember,
  viewerLoggedIn,
  clubSlug,
  /** Compacto = el control de una fila de agenda; si no, el CTA de la ficha. */
  compact = false,
  eventTitle,
  onFollowersChanged,
}: {
  activityId: string;
  eventState: EventState;
  followState: EventFollowState;
  viewerIsMember: boolean;
  viewerLoggedIn: boolean;
  clubSlug: string;
  compact?: boolean;
  eventTitle: string;
  onFollowersChanged?: () => void;
}) {
  const t = useTranslations("activity");
  const pathname = usePathname();
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const {
    state: current,
    isPending,
    run,
  } = useOptimisticAction({ state: followState, reducer: eventFollowReducer });

  // Sin sesión no hay a quién seguir nada: se manda a entrar y se vuelve aquí.
  if (!viewerLoggedIn) {
    return (
      <Link
        href={loginHref(pathname)}
        className={buttonVariants("primary", compact ? "px-3 py-1.5 text-xs" : "")}
      >
        {t("eventFollow")}
      </Link>
    );
  }

  // No miembro: NO se pinta un botón que la RPC rechazaría. Se ofrece lo que sí
  // puede hacer (entrar al club). El contador de seguidores sigue visible: es
  // información del club, no un dato privado de nadie.
  if (!viewerIsMember) {
    return compact ? null : (
      <div className="flex flex-col gap-2">
        <Link href={`/club/${clubSlug}`} className={buttonVariants("secondary")}>
          {t("eventJoinToFollow")}
        </Link>
        <p className="text-xs text-muted-foreground">{t("eventFollowNotMember")}</p>
      </div>
    );
  }

  const seguible = canFollowEvent(eventState);

  function toggle() {
    setErrorCode(null);
    const iba = current.following;
    run({ type: iba ? "unfollow" : "follow" }, async () => {
      const result = iba
        ? await unfollowClubEvent(activityId)
        : await followClubEvent(activityId);
      if (!result.ok) {
        setErrorCode(result.code);
        // Se relanza para que useOptimisticAction revierta: sin esto el optimismo
        // se quedaría pintando un estado que el servidor no confirmó.
        throw new Error(result.code);
      }
      // La lista de seguidores y el contador viven en el servidor; el optimismo
      // solo adelanta el botón. router.refresh() los reconcilia.
      router.refresh();
      onFollowersChanged?.();
    });
  }

  const label = isPending
    ? t("eventFollowSaving")
    : current.following
      ? t("eventFollowing")
      : t("eventFollow");

  // El motivo de estar deshabilitado se dice con palabras, no solo con opacidad:
  // un botón gris sin explicación es un botón roto a ojos de quien lo pulsa.
  const razonBloqueo =
    eventState === "cancelado"
      ? t("eventCancelledTitle")
      : eventState === "finalizado"
        ? t("eventFinishedNote")
        : null;

  const boton = (
    <Button
      type="button"
      variant={current.following ? "secondary" : "primary"}
      // Deshabilitado mientras vuela: es lo que impide la doble pulsación. Y
      // aunque se colara, la RPC es idempotente.
      disabled={isPending || (!seguible && !current.following)}
      aria-busy={isPending}
      onClick={toggle}
      className={compact ? "px-3 py-1.5 text-xs" : "w-full"}
      // El nombre accesible lleva el título del evento: en una lista de cinco
      // filas, cinco botones que solo dicen «Seguir» son indistinguibles con
      // lector de pantalla.
      aria-label={
        compact
          ? `${current.following ? t("eventUnfollow") : t("eventFollow")}: ${eventTitle}`
          : undefined
      }
    >
      {current.following ? (
        <CheckIcon className="h-4 w-4" aria-hidden />
      ) : (
        <BellIcon className="h-4 w-4" aria-hidden />
      )}
      {!compact && label}
    </Button>
  );

  if (compact) return boton;

  return (
    <div className="flex flex-col gap-2">
      {boton}
      {/* El motivo de bloqueo MANDA sobre el estado de seguimiento. Al revés
          —enseñando «recibirás un recordatorio» a quien sigue un evento
          cancelado— la ficha prometía un aviso que no va a llegar nunca. Se vio
          en la verificación en navegador. */}
      {errorCode ? (
        <p role="alert" className="text-xs text-status-dropped">
          {t("eventFollowError")}
        </p>
      ) : razonBloqueo ? (
        <p className="text-xs text-muted-foreground">{razonBloqueo}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("eventFollowHint")}</p>
      )}
    </div>
  );
}
