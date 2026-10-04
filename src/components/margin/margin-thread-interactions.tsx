"use client";

import { ReviewInteractions } from "@/components/social/review-interactions";
import type { InteractionSummary } from "@/lib/social/interactions";

// Hilo privado de una nota en el margen: wrapper fino sobre ReviewInteractions.
// La RLS ya limita el hilo a autor y lector; sin reacción propia sobre la nota
// (la conversación es lo que cuenta) y sin notas de voz en esta superficie.
export function MarginThreadInteractions({
  summary,
  viewerLoggedIn,
  knownUsernames = [],
}: {
  summary: InteractionSummary;
  viewerLoggedIn: boolean;
  knownUsernames?: string[];
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
      knownUsernames={knownUsernames}
    />
  );
}
