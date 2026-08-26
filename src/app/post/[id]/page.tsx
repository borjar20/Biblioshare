import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPostEvent, getPostContext, type FeedEntry } from "@/lib/social/feed";
import { FeedItem } from "@/components/social/feed-item";
import { PostThread } from "@/components/social/post-thread";
import { PostAside, type AsideParticipant } from "@/components/social/post-aside";
import { WorkSummaryCard } from "@/components/social/work-summary-card";
import { getWorkSummary } from "@/lib/social/work-summary";
import { RouteMessages } from "@/components/route-messages";
import { SHELL_POST } from "@/lib/ui/layout";

// Ruta propia del post (`/post/[id]`): donde aterrizan notificaciones y deep
// links —incluido el deep-link al SUBHILO `#c-<id>` (posts Spec 2b)—. Es una
// lectura filtrada por RLS por usuario (la audiencia de un post = su perfil),
// así que NO es cacheable en servidor (regla #437): nada de `use cache`, ruta
// dinámica.
export const metadata: Metadata = {
  title: "Publicación — Biblioshare",
};

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  // La RLS de `posts` gatea la audiencia: "no visible" y "no existe" vuelven
  // igual (null). Un post PÚBLICO lo ve también un anónimo, así que no se
  // redirige a login — solo 404 si no es visible.
  const result = await getPostEvent(supabase, user?.id ?? null, id);
  if (!result) notFound();

  const { event, knownUsernames } = result;
  const entry: FeedEntry = {
    source: "person",
    id: event.id,
    eventDate: event.eventDate,
    orderDate: event.orderDate,
    sortDate: event.sortDate,
    event,
  };
  const targetId = event.interactionTarget?.interactionTargetId ?? null;

  // Ancla REAL de la obra: para un pensamiento vive en `thought.anchor`
  // (itemType/itemId son un placeholder inerte); para el resto, el par
  // itemType/itemId ES el ancla de catálogo. Mismo criterio que `getPostContext`.
  const anchorType = event.thought?.anchor.type ?? event.itemType;
  const anchorId = event.thought?.anchor.id ?? event.itemId;

  // Contexto SOCIAL del raíl derecho + resumen de la OBRA del raíl izquierdo, en
  // paralelo (ambos dependen solo de `event`). Participantes = autores DISTINTOS
  // de los comentarios ya cargados (el hilo es corto, prefetch ≤20); "más del
  // autor" (por continuidad temática, RPC) y "más sobre la obra" son consultas
  // propias de `getPostContext`.
  const [context, workSummary] = await Promise.all([
    getPostContext(supabase, event),
    getWorkSummary(supabase, user?.id ?? null, anchorType, anchorId),
  ]);
  const participantsById = new Map<string, AsideParticipant>();
  for (const c of event.comments) {
    if (!participantsById.has(c.authorId)) {
      participantsById.set(c.authorId, { id: c.authorId, name: c.author, avatarUrl: c.authorAvatarUrl });
    }
  }
  const participants = [...participantsById.values()];
  const workTitle = event.thought?.anchor.title ?? event.itemTitle;

  // Cabecera = el post (tarjeta-hero, SIN su barra de interacción:
  // `showInteractions={false}`), y debajo el hilo como ciudadano de primera —
  // árbol anidado al estilo Reddit con su composer y el deep-link `#c-<id>`.
  // `hideActor` queda en false: aquí sí interesa quién publicó.
  //
  // `RouteMessages` con feed+social (patrón #444): sin este envoltorio las
  // piezas de cliente (ThoughtCard/PostThread…) pintarían las CLAVES i18n
  // crudas. Mismos ns que el feed de Inicio.
  // Tres áreas (`.post-grid`): OBRA · CONVERSACIÓN · SOCIAL. Jerarquía visual
  // OBRA→CONVERSACIÓN→SOCIAL, pero prioridad responsive CONVERSACIÓN>SOCIAL>OBRA
  // — a <1023 cae a una columna, OBRA se oculta (accesible por la tarjeta
  // vinculada del post) y SOCIAL cae bajo el hilo. Los raíles conservan TODA su
  // información mientras son visibles (sin degradación por ancho). El DOM va
  // conversación→obra→social; las `grid-template-areas` recolocan OBRA a ≥1023.
  // `pb-28` en móvil deja aire para el composer fijo del hilo (que posee la
  // página; el árbol ya no lo añade). Cabecera = el post (tarjeta-hero, SIN su
  // barra de interacción) y debajo el hilo anidado con su composer y deep-link.
  return (
    <RouteMessages ns={["feed", "social"]}>
      <div className={`mx-auto w-full ${SHELL_POST} flex-1 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
        <div className="post-grid pb-28 min-[1023px]:pb-0">
          <div data-area="conversacion" className="flex min-w-0 flex-col gap-4">
            <FeedItem
              entry={entry}
              viewerLoggedIn={!!user}
              knownUsernames={knownUsernames}
              showInteractions={false}
            />
            {targetId && (
              <PostThread
                interactionTargetId={targetId}
                reactionCount={event.reactionCount}
                viewerReacted={event.viewerReacted}
                commentCount={event.commentCount}
                comments={event.comments}
                reactions={event.reactions}
                viewerLoggedIn={!!user}
                knownUsernames={knownUsernames}
              />
            )}
          </div>

          {workSummary && (
            <div data-area="obra">
              <WorkSummaryCard work={workSummary} />
            </div>
          )}

          <div data-area="social">
            <PostAside
              authorUsername={event.actorUsername}
              authorName={event.actorDisplayName || event.actorUsername}
              workTitle={workTitle}
              participants={participants}
              participantCount={participants.length}
              moreByAuthor={context.moreByAuthor}
              moreAboutWork={context.moreAboutWork}
            />
          </div>
        </div>
      </div>
    </RouteMessages>
  );
}
