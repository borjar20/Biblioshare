"use client";

import { type ClubActivity } from "@/lib/clubs/activities/core";
import type { JoinRequest } from "@/lib/clubs/join-requests";
import { ProposalModeration } from "./proposal-moderation";
import { JoinRequestList } from "./join-request-list";
import { ManageMembers } from "./manage-members";

// La pestaña Gestión: lo que un moderador viene a resolver. Las propuestas
// abiertas primero (es lo que espera a alguien), y debajo los miembros.
export function ClubManagement({
  clubId,
  clubSlug,
  viewerId,
  viewerRole,
  initialActivities,
  initialJoinRequests,
  today,
}: {
  clubId: string;
  clubSlug: string;
  viewerId: string;
  viewerRole: "moderator" | "owner";
  initialActivities: ClubActivity[];
  initialJoinRequests: JoinRequest[];
  /** "Hoy" del servidor, reenviado a ProposalModeration → ActivityCard (#271). */
  today: string;
}) {
  // Deriva de props: moderar una propuesta revalida (Fase 1) y la RSC re-ejecuta
  // con las actividades frescas. Sin espejo local ni re-fetch cliente.
  const proposed = initialActivities.filter((a) => a.status === "proposed");

  return (
    <div className="flex flex-col gap-6">
      <ProposalModeration
        proposals={proposed}
        clubSlug={clubSlug}
        canModerate
        today={today}
      />

      <JoinRequestList clubId={clubId} initialRequests={initialJoinRequests} />

      <ManageMembers
        clubId={clubId}
        viewerRole={viewerRole}
        viewerId={viewerId}
      />
    </div>
  );
}
