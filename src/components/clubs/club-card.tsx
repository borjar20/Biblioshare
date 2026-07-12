"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Club, ClubMembershipStatus } from "@/lib/clubs/clubs";
import { joinClub } from "@/lib/clubs/membership";
import { Button } from "@/components/ui/button";

// discoverPublicClubs solo devuelve clubes visibility='public' (filtrado en
// la query), así que viewerStatus aquí solo es realmente "none" o "active"
// -- un club privado nunca aparece en esta lista (unirse a uno es solo por
// invitación, ver Task 1/4), así que no hace falta un botón de "solicitar".
export function ClubCard({ club }: { club: Club & { viewerStatus: ClubMembershipStatus } }) {
  const t = useTranslations("club");
  const [status, setStatus] = useState(club.viewerStatus);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinClub(club.id);
      setStatus("active");
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
      <Link href={`/club/${club.slug}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{club.name}</span>
        {club.description && (
          <span className="truncate text-xs text-muted-foreground">{club.description}</span>
        )}
      </Link>
      {status === "none" && (
        <Button type="button" variant="secondary" disabled={isPending} onClick={handleJoin}>
          {t("join")}
        </Button>
      )}
    </div>
  );
}
