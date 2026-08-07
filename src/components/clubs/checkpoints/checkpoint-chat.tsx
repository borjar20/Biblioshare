"use client";

import { ReviewInteractions } from "@/components/social/review-interactions";
import type { InteractionSummary } from "@/lib/social/interactions";

// Chat de un checkpoint de buddy_read (EPIC-05, Bloque H1) -- wrapper fino
// sobre ReviewInteractions ya existente (Bloque B/F): la RLS de
// can_view_target ya filtra el contenido a "participante que alcanzó este
// checkpoint" (has_reached_checkpoint), así que un summary vacío aquí
// significa simplemente "sin acceso todavía", sin lógica extra en el cliente.
export function CheckpointChat({
  summary,
  viewerLoggedIn,
  clubId,
  knownUsernames,
}: {
  summary: InteractionSummary;
  viewerLoggedIn: boolean;
  /** Club de la actividad del checkpoint -- acota el autocompletar de @menciones a sus miembros. */
  clubId: string;
  /** Usernames @mencionados que existen de verdad, resueltos server-side (resolveKnownMentions). */
  knownUsernames: string[];
}) {
  return (
    <ReviewInteractions
      interactionTargetId={summary.interactionTargetId}
      reactionCount={summary.reactionCount}
      viewerReacted={summary.viewerReacted}
      commentCount={summary.commentCount}
      comments={summary.comments}
      reactions={summary.reactions}
      viewerLoggedIn={viewerLoggedIn}
      showTargetReaction={false}
      clubId={clubId}
      knownUsernames={knownUsernames}
    />
  );
}
