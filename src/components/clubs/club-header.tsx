"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { getClub } from "@/lib/clubs/clubs";
import { joinClub, leaveClub, acceptInvite, declineInvite } from "@/lib/clubs/membership";
import { ClubForm } from "./club-form";
import { Button } from "@/components/ui/button";

type ClubDetail = NonNullable<Awaited<ReturnType<typeof getClub>>>;

export function ClubHeader({ club, userId }: { club: ClubDetail; userId: string }) {
  const t = useTranslations("club");
  const [status, setStatus] = useState(club.viewerStatus);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinClub(club.id);
      setStatus("active");
    });
  }

  function handleLeave() {
    startTransition(async () => {
      try {
        await leaveClub(club.id);
        setStatus("none");
      } catch {
        setError(t("leaveOwnerError"));
      }
    });
  }

  function handleAccept() {
    startTransition(async () => {
      await acceptInvite(club.id);
      setStatus("active");
    });
  }

  function handleDecline() {
    startTransition(async () => {
      await declineInvite(club.id);
      setStatus("none");
    });
  }

  const canEdit = club.viewerRole === "moderator" || club.viewerRole === "owner";

  // status === "none" solo puede ocurrir aquí para un club PÚBLICO: getClub()
  // devuelve null (404, ver page.tsx) para un club privado visto por un
  // no-miembro, así que ClubHeader nunca llega a renderizar en ese caso -- no
  // hace falta distinguir público/privado en el botón de unirse.
  return (
    <div className="flex flex-col gap-4">
      {club.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que profile-header
        <img src={club.coverUrl} alt="" className="h-40 w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{club.name}</h1>
          {club.description && (
            <p className="max-w-prose text-sm text-muted-foreground">{club.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status === "none" && (
            <Button type="button" disabled={isPending} onClick={handleJoin}>
              {t("join")}
            </Button>
          )}
          {status === "invited" && (
            <>
              <Button type="button" disabled={isPending} onClick={handleAccept}>
                {t("acceptInvite")}
              </Button>
              <Button type="button" variant="ghost" disabled={isPending} onClick={handleDecline}>
                {t("declineInvite")}
              </Button>
            </>
          )}
          {status === "active" && club.viewerRole !== "owner" && (
            <Button type="button" variant="secondary" disabled={isPending} onClick={handleLeave}>
              {t("leave")}
            </Button>
          )}
          {canEdit && (
            <Button type="button" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {t("editToggle")}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      {editing && (
        <ClubForm
          userId={userId}
          mode="edit"
          club={club}
          onUpdated={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
