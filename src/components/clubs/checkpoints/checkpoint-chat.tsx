"use client";

import { ReviewInteractions } from "@/components/social/review-interactions";
import type { InteractionSummary } from "@/lib/social/interactions";

// Chat de un checkpoint de buddy_read (EPIC-05, Bloque H1) -- wrapper fino
// sobre ReviewInteractions ya existente (Bloque B/F): la RLS de
// can_view_target ya filtra el contenido a "participante que alcanzó este
// checkpoint" (has_reached_checkpoint), así que un summary vacío aquí
// significa simplemente "sin acceso todavía", sin lógica extra en el cliente.
export function CheckpointChat({
  checkpointId,
  summary,
  viewerLoggedIn,
}: {
  checkpointId: string;
  summary: InteractionSummary;
  viewerLoggedIn: boolean;
}) {
  return (
    <ReviewInteractions
      targetType="activity_checkpoint"
      targetId={checkpointId}
      reactionCount={summary.reactionCount}
      viewerReacted={summary.viewerReacted}
      commentCount={summary.commentCount}
      comments={summary.comments}
      viewerLoggedIn={viewerLoggedIn}
      showTargetReaction={false}
    />
  );
}
