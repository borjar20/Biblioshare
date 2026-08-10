import type { FeedEntry } from "@/lib/social/feed";
import { ClubFeedCard } from "./club-feed-card";
import { CollectionCard } from "./collection-card";
import { ProgressTimelineCard } from "./progress-timeline-card";
import { EpisodeRatingsCard } from "./episode-ratings-card";
import { ReviewCard } from "./review-card";
import { ThoughtCard } from "./thought-card";
import { MilestoneCard } from "./milestone-card";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";

export function FeedItem({
  entry,
  viewerLoggedIn,
  knownUsernames,
  hideActor = false,
  showInteractions = true,
}: {
  entry: FeedEntry;
  viewerLoggedIn: boolean;
  /** Usernames @mencionados que existen de verdad (Reseña, Colección, Avances). */
  knownUsernames: string[];
  /** Oculta avatar+nombre en la cabecera: la Actividad del perfil ya está en el
   *  perfil del actor, repetir su nombre en cada tarjeta sobra (issue #302). */
  hideActor?: boolean;
  /** `false` en la CABECERA de /post/[id] (posts Spec 2b): allí el hilo lo pinta
   *  `PostThread` aparte, así que la tarjeta-hero no debe repetir su barra de
   *  interacción. En el feed queda `true` (resumen/enlace al post). */
  showInteractions?: boolean;
}) {
  if (entry.source === "club") return <ClubFeedCard event={entry.event} />;

  // `person-group` lo producían el feed y el perfil al agrupar; con posts ya no
  // se generan grupos (cada post es una tarjeta). Se conserva el despacho por si
  // una superficie vuelve a agrupar.
  if (entry.source === "person-group") {
    if (entry.verb === "added")
      return <CollectionCard entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
    if (entry.verb === "progressed")
      return <ProgressTimelineCard entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
    // rated / reviewed / watchedEpisode → valoraciones de episodios agrupadas.
    return <EpisodeRatingsCard entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
  }

  // source === "person": el feed emite SIEMPRE `kind` (posts); las previews
  // legadas sin kind (`shared-activity`) caen al despacho por `verb`.
  const e = entry.event;
  const kind = e.kind;

  if (kind === "thought" || (!kind && e.verb === "thought")) {
    // `itemType`/`itemId` de un pensamiento son un valor INERTE (ver feed.ts):
    // esta tarjeta solo lee `e.thought`. Defensivo: getFeed lo garantiza relleno.
    if (!e.thought) return null;
    return <ThoughtCard event={e} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
  }

  if (kind === "started" || kind === "dropped") {
    return <MilestoneCard event={e} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
  }

  // progressed (posts) y "added"/"progressed" legados: las tarjetas de Colección
  // y Avances esperan un grupo, así que el singleton se envuelve como grupo de 1
  // (ya manejan items.length === 1: sin pie "Guardar los N", timeline de 1 paso).
  if (kind === "progressed" || (!kind && (e.verb === "added" || e.verb === "progressed"))) {
    const asGroup: PersonGroupEntry = {
      source: "person-group",
      id: entry.id,
      eventDate: entry.eventDate,
      orderDate: entry.orderDate,
      sortDate: entry.sortDate,
      verb: kind === "progressed" ? "progressed" : (e.verb as "added" | "progressed"),
      actor: { id: e.actorId, username: e.actorUsername, displayName: e.actorDisplayName, avatarUrl: e.actorAvatarUrl },
      items: [e],
    };
    return e.verb === "added"
      ? <CollectionCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />
      : <ProgressTimelineCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
  }

  // finished / watched (posts) y rated / reviewed / watchedEpisode (legado) → Reseña.
  return <ReviewCard event={e} viewerLoggedIn={viewerLoggedIn} knownUsernames={knownUsernames} hideActor={hideActor} showInteractions={showInteractions} />;
}
