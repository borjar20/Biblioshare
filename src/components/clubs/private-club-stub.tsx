"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubIdentity } from "@/lib/clubs/join-requests";
import { requestJoinClub, withdrawJoinRequest } from "@/lib/clubs/join-requests";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LockIcon } from "@/components/ui/icons";

// Un club privado del que no eres miembro: ves QUÉ es, no lo que hay dentro.
// Mismo modelo que el perfil privado (identidad visible, contenido oculto), y
// mismo gesto: solicitar entrada.
export function PrivateClubStub({
  club,
  hasRequested,
}: {
  club: ClubIdentity;
  /** Ya has solicitado entrar y estás esperando moderación. */
  hasRequested: boolean;
}) {
  const t = useTranslations("club");
  const [requested, setRequested] = useState(hasRequested);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (requested) {
        await withdrawJoinRequest(club.id);
        setRequested(false);
      } else {
        await requestJoinClub(club.id);
        setRequested(true);
      }
    });
  }

  return (
    <EmptyState
      glyph={<LockIcon className="h-7 w-7" />}
      title={club.name}
      message={club.description ?? t("privateDescription")}
      action={
        <Button
          type="button"
          variant={requested ? "secondary" : "primary"}
          disabled={isPending}
          onClick={toggle}
        >
          {requested ? t("requestPending") : t("requestJoin")}
        </Button>
      }
      secondary={
        requested ? (
          <span className="text-muted-foreground">{t("requestPendingHint")}</span>
        ) : undefined
      }
    />
  );
}
