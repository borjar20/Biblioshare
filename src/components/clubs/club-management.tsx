"use client";

import { useState, useTransition } from "react";
import {
  listClubActivities,
  type ClubActivity,
} from "@/lib/clubs/activities/core";
import { ProposalModeration } from "./proposal-moderation";
import { ManageMembers } from "./manage-members";

// La pestaña Gestión: lo que un moderador viene a resolver. Las propuestas
// abiertas primero (es lo que espera a alguien), y debajo los miembros.
export function ClubManagement({
  clubId,
  clubSlug,
  viewerId,
  viewerRole,
  initialActivities,
}: {
  clubId: string;
  clubSlug: string;
  viewerId: string;
  viewerRole: "moderator" | "owner";
  initialActivities: ClubActivity[];
}) {
  const [activities, setActivities] = useState(initialActivities);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      setActivities(await listClubActivities(clubId));
    });
  }

  const proposed = activities.filter((a) => a.status === "proposed");

  return (
    <div className="flex flex-col gap-6">
      <ProposalModeration
        proposals={proposed}
        clubSlug={clubSlug}
        canModerate
        onChanged={refresh}
      />

      <ManageMembers
        clubId={clubId}
        viewerRole={viewerRole}
        viewerId={viewerId}
      />
    </div>
  );
}
