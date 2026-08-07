"use client";

import { ActivityChatBubbles } from "./activity-chat-bubbles";
import type { InteractionSummary } from "@/lib/social/interactions";

// Chat general de una actividad (reto de lista / tierlist / genérico). Wrapper
// fino sobre ActivityChatBubbles (presentación de burbujas de mensajería) con
// el target 'club_activity': la RLS (can_view_target = is_activity_participant)
// ya filtra a participantes, así que un summary vacío significa "no participas /
// aún no hay mensajes".
export function ActivityChat({
  summary,
  viewerLoggedIn,
  clubId,
  knownUsernames,
}: {
  summary: InteractionSummary;
  viewerLoggedIn: boolean;
  /** Club de la actividad -- acota el autocompletar de @menciones a sus miembros. */
  clubId: string;
  /** Usernames @mencionados que existen de verdad, resueltos server-side (resolveKnownMentions). */
  knownUsernames: string[];
}) {
  return (
    <ActivityChatBubbles
      interactionTargetId={summary.interactionTargetId}
      reactionCount={summary.reactionCount}
      viewerReacted={summary.viewerReacted}
      commentCount={summary.commentCount}
      comments={summary.comments}
      reactions={summary.reactions}
      viewerLoggedIn={viewerLoggedIn}
      clubId={clubId}
      knownUsernames={knownUsernames}
    />
  );
}
