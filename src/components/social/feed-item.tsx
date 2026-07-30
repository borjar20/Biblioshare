import type { FeedEntry } from "@/lib/social/feed";
import { ClubFeedCard } from "./club-feed-card";
import { CollectionCard } from "./collection-card";
import { ProgressTimelineCard } from "./progress-timeline-card";
import { ReviewCard } from "./review-card";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";

export function FeedItem({
  entry,
  viewerLoggedIn,
  knownUsernames,
}: {
  entry: FeedEntry;
  viewerLoggedIn: boolean;
  /** Usernames @mencionados que existen de verdad (solo lo usa la variante Reseña). */
  knownUsernames: string[];
}) {
  if (entry.source === "club") return <ClubFeedCard event={entry.event} />;

  // Un evento singleton se envuelve como grupo de 1 para las variantes A/B, que
  // ya manejan items.length === 1 (sin pie "Guardar los N", timeline de 1 paso).
  if (entry.source === "person-group") {
    return entry.verb === "added"
      ? <CollectionCard entry={entry} viewerLoggedIn={viewerLoggedIn} />
      : <ProgressTimelineCard entry={entry} viewerLoggedIn={viewerLoggedIn} />;
  }

  // source === "person": elegir por verbo del evento.
  const e = entry.event;
  if (e.verb === "added" || e.verb === "progressed") {
    const asGroup: PersonGroupEntry = {
      source: "person-group",
      id: entry.id,
      eventDate: entry.eventDate,
      verb: e.verb,
      actor: { id: e.actorId, username: e.actorUsername, displayName: e.actorDisplayName, avatarUrl: e.actorAvatarUrl },
      items: [e],
    };
    return e.verb === "added"
      ? <CollectionCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} />
      : <ProgressTimelineCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} />;
  }
  // finished / rated / reviewed / watchedEpisode → Reseña
  return <ReviewCard event={e} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} />;
}
