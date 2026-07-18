"use client";

import { ReviewInteractions } from "@/components/social/review-interactions";
import type { InteractionSummary } from "@/lib/social/interactions";

// Chat general de una actividad (reto de lista / tierlist / genérico). Wrapper
// fino sobre ReviewInteractions con el target 'club_activity': la RLS
// (can_view_target = is_activity_participant) ya filtra a participantes, así que
// un summary vacío significa "no participas / aún no hay mensajes".
export function ActivityChat({
  activityId,
  summary,
  viewerLoggedIn,
}: {
  activityId: string;
  summary: InteractionSummary;
  viewerLoggedIn: boolean;
}) {
  return (
    <ReviewInteractions
      targetType="club_activity"
      targetId={activityId}
      reactionCount={summary.reactionCount}
      viewerReacted={summary.viewerReacted}
      commentCount={summary.commentCount}
      comments={summary.comments}
      viewerLoggedIn={viewerLoggedIn}
      showTargetReaction={false}
    />
  );
}
