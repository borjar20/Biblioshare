import Link from "next/link";
import type { FeedEntry } from "@/lib/social/feed";
import { ClubFeedCard } from "./club-feed-card";
import { CollectionCard } from "./collection-card";
import { ProgressTimelineCard } from "./progress-timeline-card";
import { EpisodeRatingsCard } from "./episode-ratings-card";
import { ReviewCard } from "./review-card";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { anchorHref } from "@/lib/catalog/anchor";

export function FeedItem({
  entry,
  viewerLoggedIn,
  knownUsernames,
  hideActor = false,
}: {
  entry: FeedEntry;
  viewerLoggedIn: boolean;
  /** Usernames @mencionados que existen de verdad (Reseña, Colección, Avances). */
  knownUsernames: string[];
  /** Oculta avatar+nombre en la cabecera: la Actividad del perfil ya está en el
   *  perfil del actor, repetir su nombre en cada tarjeta sobra (issue #302). */
  hideActor?: boolean;
}) {
  if (entry.source === "club") return <ClubFeedCard event={entry.event} />;

  // Un evento singleton se envuelve como grupo de 1 para las variantes A/B, que
  // ya manejan items.length === 1 (sin pie "Guardar los N", timeline de 1 paso).
  if (entry.source === "person-group") {
    if (entry.verb === "added")
      return <CollectionCard entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} />;
    if (entry.verb === "progressed")
      return <ProgressTimelineCard entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} />;
    // rated / reviewed / watchedEpisode → valoraciones de episodios agrupadas.
    return <EpisodeRatingsCard entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} />;
  }

  // source === "person": elegir por verbo del evento.
  const e = entry.event;
  if (e.verb === "added" || e.verb === "progressed") {
    const asGroup: PersonGroupEntry = {
      source: "person-group",
      id: entry.id,
      eventDate: entry.eventDate,
      orderDate: entry.orderDate,
      sortDate: entry.sortDate,
      verb: e.verb,
      actor: { id: e.actorId, username: e.actorUsername, displayName: e.actorDisplayName, avatarUrl: e.actorAvatarUrl },
      items: [e],
    };
    return e.verb === "added"
      ? <CollectionCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} />
      : <ProgressTimelineCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} />;
  }
  if (e.verb === "thought") {
    // ponytail: placeholder — Fase 5 (Task 5.3) lo reemplaza por
    // <ThoughtCard>. `itemType`/`itemId` de este evento son un valor INERTE
    // (ver el comentario en feed.ts): esta tarjeta NUNCA debe leerlos, solo
    // `e.thought`. Defensivo: `thought` siempre viene relleno para este verbo
    // (getFeed lo garantiza), pero si algún día no lo estuviera, no hay nada
    // seguro que pintar.
    if (!e.thought) return null;
    const actorName = e.actorDisplayName || e.actorUsername;
    return (
      <article className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 text-sm">
        {!hideActor && <p className="text-foreground">{actorName} compartió un pensamiento</p>}
        <Link
          href={anchorHref(e.thought.anchor.type, e.thought.anchor.id)}
          className="font-medium hover:underline"
        >
          {e.thought.anchor.title}
        </Link>
        <p className="text-muted-foreground">{e.thought.body}</p>
      </article>
    );
  }
  // finished / rated / reviewed / watchedEpisode → Reseña
  return <ReviewCard event={e} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} />;
}
