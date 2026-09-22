"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { PostSummary } from "@/components/social/post-summary";
import { RichTextView } from "@/components/social/rich-text-view";
import { SpoilerGate } from "./spoiler-gate";
import { anchorHref } from "@/lib/catalog/anchor";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";

// Tarjeta de «Pensamiento» (Fase 5, Task 5.3): cabecera + píldora dorada,
// chip del ancla (obra/saga/persona), cuerpo markdown-lite con blur de
// spoiler (reutiliza SpoilerGate, mismo patrón que las notas públicas de
// progress-timeline-card) y el hilo estándar de ReviewInteractions.
// `event.thought` SIEMPRE viene relleno para verb:"thought" (lo garantiza
// getFeed) — el caller (feed-item.tsx) ya lo comprueba antes de renderizar,
// pero el tipo de FeedEvent lo deja nullable, así que aquí también se guarda.
export function ThoughtCard({
  event,
  hideActor = false,
  knownUsernames,
  showInteractions = true,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (cuerpo + comentarios). */
  knownUsernames: string[];
  /** `false` en la cabecera de /post/[id]: el hilo lo pinta PostThread aparte. */
  showInteractions?: boolean;
}) {
  const t = useTranslations("feed");
  const { thought } = event;
  // Hooks SIEMPRE antes del early return de abajo (`if (!thought || deleted)`).
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  if (!thought || deleted) return null;
  const actorName = event.actorDisplayName || event.actorUsername;

  const bodyEl = <RichTextView text={thought.body} knownUsernames={knownUsernames} />;

  // `event.viewerCanDelete` no depende de `hideActor` (dueño o admin puede
  // borrar tanto en el feed de Inicio como en la pestaña Actividad de un
  // perfil, que renderiza con hideActor=true) — así que el trigger tiene que
  // existir SIEMPRE que se pueda borrar, con o sin cabecera. `ActionMenu` ya
  // trae aria-haspopup, cierre por Escape/clic-fuera y el estilo `danger`
  // (src/components/ui/action-menu.tsx) — nada de esto se reimplementa aquí.
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );

  return (
    <article className="relative flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {!hideActor ? (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            <span className="text-muted-foreground">{t("thoughtShared")}</span>
          </p>
          <span className="shrink-0 self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
            {t("kind.thought")}
          </span>
          {deleteMenu}
        </div>
      ) : (
        // Sin cabecera (perfil, hideActor): el trigger va en su PROPIA fila,
        // en flujo normal alineado a la derecha. Un `absolute` sobre la tarjeta
        // se solapaba con el chip del ancla (no hay banda reservada como en
        // club-header); una fila propia no puede solaparse con nada.
        deleteMenu && <div className="-mb-1 flex justify-end">{deleteMenu}</div>
      )}

      <Link
        href={anchorHref(thought.anchor.type, thought.anchor.id)}
        className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted p-2.5 hover:border-accent"
      >
        <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded bg-surface">
          {thought.anchor.imageUrl && (
            <Image src={thought.anchor.imageUrl} alt="" fill sizes="32px" className="object-cover" />
          )}
        </div>
        <span className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold text-foreground">
          {thought.anchor.title}
        </span>
      </Link>

      <div className="font-serif text-[14px] leading-relaxed text-foreground">
        {thought.isSpoiler ? <SpoilerGate>{bodyEl}</SpoilerGate> : bodyEl}
      </div>

      {showInteractions && event.postId && (
        <PostSummary
          postId={event.postId}
          reactionCount={event.reactionCount}
          commentCount={event.commentCount}
        />
      )}
      {deleteError && <PostDeleteError />}
      <TimeAgo iso={event.eventDate} className="self-end font-mono text-[10px] text-muted-foreground" />
    </article>
  );
}
