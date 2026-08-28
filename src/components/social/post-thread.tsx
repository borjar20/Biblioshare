"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { loginHref } from "@/lib/auth/safe-next";
import { CommentIcon, MicIcon } from "@/components/ui/icons";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  toggleReaction,
  addComment,
  editComment,
  pinComment,
  deleteComment,
} from "@/lib/social/interaction-actions";
import {
  emptyReactions,
  type InteractionComment,
  type ReactionsByEmoji,
} from "@/lib/social/interactions";
import { buildCommentTree, MAX_THREAD_DEPTH, type CommentSort, type CommentNode } from "@/lib/social/comment-tree";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { interactionReducer } from "@/lib/social/interaction-optimistic";
import { voiceGate } from "@/lib/voice/voice-note-limits";
import { markVoiceTooltipSeen, useVoiceTooltipVisible } from "@/lib/voice/voice-tooltip";
import { useMentionAutocomplete } from "./use-mention-autocomplete";
import { RichTextView } from "./rich-text-view";
import { SpoilerGate } from "./spoiler-gate";
import { UserAvatar } from "./user-avatar";
import { CommentActions } from "./comment-actions";
import { CommentComposer } from "./comment-composer";
import { ReactionBar } from "./reaction-bar";
import { VoiceNoteChip } from "./voice-note-chip";
import { VoiceMiniBar } from "./voice-mini-bar";
import { VoiceRecorder } from "./voice-recorder";
import { PendingVoiceNoteRow } from "./pending-voice-note";
import { useVoiceNoteSubmit } from "./use-voice-note-submit";

// Hilo de `/post/[id]` al estilo Reddit (posts Spec 2b): a diferencia de
// `ReviewInteractions` —feed y superficies compartidas, aplanado a 2 niveles y
// colapsado tras un clic— aquí la conversación es el contenido principal: árbol
// ANIDADO (buildCommentTree) con sangría corta capada a MAX_THREAD_DEPTH (2:
// raíz + un nivel; más adentro, cabecera «↳ En respuesta a @usuario»), cada
// comentario con su ancla DOM `id="c-<id>"` para el deep-link de las
// notificaciones (#c-<id>), un composer ÚNICO que en móvil va anclado abajo y al
// responder se contextualiza («Respondiendo a @X») SIN encogerse a la columna
// del nivel. Reutiliza el motor de acciones optimistas de ReviewInteractions.
export function PostThread({
  interactionTargetId,
  reactionCount,
  viewerReacted,
  commentCount,
  comments,
  reactions,
  viewerLoggedIn,
  knownUsernames = [],
}: {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByEmoji;
  viewerLoggedIn: boolean;
  knownUsernames?: string[];
}) {
  const t = useTranslations("social");
  const pathname = usePathname();
  const { state, isPending, failed, run } = useOptimisticAction({
    state: { interactionTargetId, reactionCount, viewerReacted, commentCount, comments, reactions },
    reducer: interactionReducer,
  });
  const [sort, setSort] = useState<CommentSort>("recent");
  const [replyingTo, setReplyingTo] = useState<InteractionComment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  // Bubble de "ahora puedes responder con voz" solo la primera vez (spec §3),
  // hidratación-segura: useSyncExternalStore con getServerSnapshot fijo en
  // false (issue #838, ver src/lib/voice/voice-tooltip.ts).
  const tooltipVisible = useVoiceTooltipVisible();
  const voice = useVoiceNoteSubmit(interactionTargetId);
  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    scope: { scope: "profile" },
  });

  // Pendientes cuentan como audios propios para el gate del cliente: evita
  // ráfagas mientras una subida sigue en vuelo (spec §7).
  const gate = voiceGate([
    ...state.comments.map((c) => ({ isOwn: c.isOwn, hasAudio: c.audio != null, createdAt: c.createdAt })),
    ...voice.pending.map(() => ({ isOwn: true, hasAudio: true, createdAt: "9999" })),
  ]);

  const micButton = viewerLoggedIn ? (
    <span className="relative shrink-0">
      <button
        type="button"
        data-testid="voice-mic"
        aria-label={t("voice.record")}
        title={gate.allowed ? undefined : t(gate.reason === "thread_limit" ? "voice.limitThread" : "voice.limitConsecutive")}
        disabled={!gate.allowed}
        onClick={() => {
          setVoiceMode(true);
          markVoiceTooltipSeen();
        }}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
      >
        <MicIcon className="h-4 w-4" />
      </button>
      {tooltipVisible && (
        <button
          type="button"
          onClick={markVoiceTooltipSeen}
          className="absolute bottom-full right-0 z-10 mb-1.5 w-max max-w-[180px] rounded-lg bg-foreground px-2 py-1 text-left text-[11px] font-medium text-background shadow-lg"
        >
          {t("voice.firstTimeTip")}
        </button>
      )}
    </span>
  ) : undefined;

  // Deep-link al SUBHILO: la notificación de respuesta trae `/post/<id>#c-<cid>`
  // (target del comentario con ancla, migración 20260848). Al montar y en cada
  // hashchange saltamos al comentario y lo resaltamos un instante. El árbol se
  // pinta expandido, así que el nodo SIEMPRE está en el DOM (no hay que abrir
  // ramas). Depende de comments.length: si el hilo llega tras hidratar, reintenta.
  useEffect(() => {
    function jump() {
      const hash = window.location.hash;
      if (!hash.startsWith("#c-")) return;
      const el = document.getElementById(hash.slice(1));
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.setAttribute("data-hl", "on");
      window.setTimeout(() => el.removeAttribute("data-hl"), 2200);
    }
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, [state.comments.length]);

  // Al empezar a responder, enfoca el composer inline y deja el cursor al final
  // (tras la @mención que `startReply` insertó). Enfocar ya lo trae a la vista en
  // escritorio; en móvil abre el teclado sobre el composer fijo. Es lo que evita
  // subir a la cabecera para escribir la respuesta.
  useEffect(() => {
    if (!replyingTo) return;
    const el = document.querySelector<HTMLTextAreaElement>("#reply-composer textarea");
    if (!el) return;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // el textarea pudo desmontarse entre el render y esta línea
    }
  }, [replyingTo]);

  const throwIfFailed = (res: { ok: true } | { ok: false; error: string }) => {
    if (!res.ok) throw new Error(res.error);
  };

  function newOptimistic(body: string, parentId: string | null, sp: boolean): InteractionComment {
    return {
      id: `optimistic-${Date.now()}`,
      interactionTargetId: "optimistic-comment-target",
      authorId: "",
      author: t("you"),
      authorUsername: null,
      authorAvatarUrl: null,
      initials: "",
      body,
      createdAt: new Date().toISOString(),
      isOwn: true,
      canDelete: true,
      canEdit: true,
      canPin: false,
      parentId,
      isSpoiler: sp,
      pinned: false,
      edited: false,
      audio: null,
      reactionCount: 0,
      viewerReacted: false,
      reactions: emptyReactions(),
    };
  }

  // Un único composer: raíz por defecto, o respuesta al `replyingTo` (parentId =
  // el comentario REAL, no la raíz → anidamiento de verdad).
  function submit() {
    const value = draft.trim();
    if (!value) return;
    const parentId = replyingTo?.id ?? null;
    const sp = replyingTo ? false : spoiler;
    setDraft("");
    setSpoiler(false);
    setReplyingTo(null);
    run({ type: "addComment", comment: newOptimistic(value, parentId, sp) }, async () => {
      throwIfFailed(
        await addComment(interactionTargetId, value, parentId ? { parentId } : { isSpoiler: sp }),
      );
    });
  }

  function startReply(c: InteractionComment) {
    setEditingId(null);
    setReplyingTo(c);
    setDraft(!c.isOwn && c.authorUsername ? `@${c.authorUsername} ` : "");
    // Cambiar de objetivo desarma la grabadora: si seguía "armada" (true) de un
    // hilo anterior, montaría y grabaría sin que el usuario tocara el mic
    // (issue de review, Tarea 12 finding 1).
    setVoiceMode(false);
  }

  function startEdit(c: InteractionComment) {
    setReplyingTo(null);
    setEditingId(c.id);
    setEditDraft(c.body);
    setVoiceMode(false);
  }

  function submitEdit(id: string) {
    const value = editDraft.trim();
    if (!value) return;
    setEditingId(null);
    run({ type: "editComment", id, body: value }, async () => {
      throwIfFailed(await editComment(id, value));
    });
  }

  const nodes = buildCommentTree(state.comments, sort);
  // Para la línea «↳ En respuesta a @usuario» de los nodos aplanados (depth ≥
  // MAX_THREAD_DEPTH - 1): resuelve el padre por id sin recorrer el árbol.
  const commentsById = new Map(state.comments.map((cm) => [cm.id, cm]));

  // Composer ÚNICO. Sin responder = comentario raíz en la cabecera del hilo; al
  // responder SALTA inline bajo el comentario (renderNode), a su altura, para no
  // obligar a subir a la cabecera en escritorio. En móvil el wrapper es `fixed`
  // abajo en AMBOS casos (con `position:fixed` la posición en el DOM da igual),
  // así que sigue siempre a mano. Una sola instancia montada a la vez (arriba XOR
  // inline), así el borrador y el autocompletado de menciones no se duplican.
  const composer = (
    <div className="flex flex-col gap-2">
      {replyingTo && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>
            {t("reply")} <span className="font-semibold text-accent">@{replyingTo.authorUsername ?? replyingTo.author}</span>
          </span>
          <button
            type="button"
            aria-label={t("cancel")}
            onClick={() => {
              setReplyingTo(null);
              setDraft("");
              setVoiceMode(false);
            }}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
      <div className="relative">
        {voiceMode ? (
          <VoiceRecorder
            onCancel={() => setVoiceMode(false)}
            onPublish={(rec) => {
              voice.publish(rec, { parentId: replyingTo?.id ?? null, isSpoiler: replyingTo ? false : spoiler });
              setVoiceMode(false);
              setSpoiler(false);
              // Espejo de lo que hace submit() con el camino de texto: cierra el
              // contexto de respuesta al publicar (finding 2).
              setReplyingTo(null);
            }}
          />
        ) : (
          <CommentComposer
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onInput={mention.onInput}
            onKeyDown={mention.onKeyDown}
            dropdown={mention.dropdown}
            submitLabel={t("postComment")}
            placeholder={replyingTo ? t("writeReply") : t("writeComment")}
            isSpoiler={replyingTo ? false : spoiler}
            onToggleSpoiler={replyingTo ? undefined : () => setSpoiler((v) => !v)}
            showFormatting
            busy={isPending}
            micSlot={micButton}
          />
        )}
      </div>
    </div>
  );
  const composerWrapper = (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:z-auto lg:border lg:border-border lg:rounded-xl lg:bg-surface lg:px-3.5 lg:py-3 lg:backdrop-blur-none">
      {composer}
    </div>
  );

  function renderNode(node: CommentNode) {
    const c = node.comment;
    const isRoot = node.depth === 0;
    // A partir del tope de sangría el padre ya no es visualmente obvio: la
    // cabecera «↳ En respuesta a @usuario» recupera ese contexto.
    const flattenedParent =
      node.depth >= MAX_THREAD_DEPTH && c.parentId ? commentsById.get(c.parentId) : undefined;
    return (
      <div
        key={c.id}
        id={`c-${c.id}`}
        className="scroll-mt-24 rounded-lg transition-colors data-[hl=on]:bg-accent/10 data-[hl=on]:ring-1 data-[hl=on]:ring-accent/40"
      >
        <div className="px-1 py-1.5">
          {flattenedParent && (
            <div className="mb-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <span aria-hidden>↳</span>
              <span className="min-w-0 truncate">
                {t("inReplyTo")}{" "}
                <span className="font-medium text-accent">
                  @{flattenedParent.authorUsername ?? flattenedParent.author}
                </span>
              </span>
            </div>
          )}
          {/* Cabecera: avatar + nombre + fecha. El cuerpo va DEBAJO, a ancho
              completo y alineado con el avatar — sin la sangría del ancho del
              avatar, que en móvil estrechaba cada nivel. */}
          <div className="flex items-center gap-2.5">
            <UserAvatar name={c.author} avatarUrl={c.authorAvatarUrl} size={isRoot ? 26 : 22} />
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px]">
              {c.authorUsername ? (
                <Link href={`/u/${c.authorUsername}`} className="min-w-0 truncate font-semibold hover:underline">
                  {c.author}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-semibold">{c.author}</span>
              )}
              {c.pinned && <span className="shrink-0 text-[10px] text-muted-foreground">📌 {t("pinned")}</span>}
              <TimeAgo iso={c.createdAt} className="shrink-0 text-[10.5px] text-muted-foreground" />
            </div>
          </div>

          <div className="mt-1 flex min-w-0 flex-col gap-1">
            {editingId === c.id ? (
              <CommentComposer
                value={editDraft}
                onChange={setEditDraft}
                onSubmit={() => submitEdit(c.id)}
                onCancel={() => {
                  setEditingId(null);
                  setEditDraft("");
                }}
                submitLabel={t("saveEdit")}
                placeholder={t("writeComment")}
                showFormatting
                compact
                busy={isPending}
              />
            ) : (
              <>
                <div className="break-words text-[14px] leading-relaxed text-foreground">
                  {c.audio ? (
                    c.isSpoiler ? (
                      <SpoilerGate>
                        <VoiceNoteChip commentId={c.id} author={c.author} audio={c.audio} />
                      </SpoilerGate>
                    ) : (
                      <VoiceNoteChip commentId={c.id} author={c.author} audio={c.audio} />
                    )
                  ) : c.isSpoiler ? (
                    <SpoilerGate>
                      <RichTextView text={c.body} knownUsernames={knownUsernames} />
                    </SpoilerGate>
                  ) : (
                    <RichTextView text={c.body} knownUsernames={knownUsernames} />
                  )}
                  {c.edited && <span className="ml-1 text-[10px] text-muted-foreground">· {t("edited")}</span>}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                  <ReactionBar
                    reactions={c.reactions}
                    disabled={isPending}
                    onToggle={(emoji) =>
                      run({ type: "toggleComment", id: c.id, emoji }, async () => {
                        await toggleReaction(c.interactionTargetId, emoji);
                      })
                    }
                  />
                  {viewerLoggedIn && (
                    <button
                      type="button"
                      onClick={() => startReply(c)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t("reply")}
                    </button>
                  )}
                  <CommentActions
                    commentId={c.id}
                    canDelete={c.canDelete}
                    canEdit={c.canEdit}
                    canPin={c.canPin}
                    pinned={c.pinned}
                    isOwn={c.isOwn}
                    isBusy={isPending}
                    onEdit={() => startEdit(c)}
                    onTogglePin={() =>
                      run({ type: "pinComment", id: c.id, pinned: !c.pinned }, async () => {
                        throwIfFailed(await pinComment(c.id, !c.pinned));
                      })
                    }
                    onDelete={() =>
                      run({ type: "deleteComment", id: c.id }, async () => {
                        throwIfFailed(await deleteComment(c.id));
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>
        {replyingTo?.id === c.id && (
          // Respuesta INLINE, a la altura del comentario (no en la cabecera): en
          // escritorio evita subir a lo alto del hilo; en móvil sigue anclado
          // abajo (fixed). Se alinea con el comentario (sangría del nivel, corta
          // y capada a MAX_THREAD_DEPTH). `id` para enfocarlo al abrir.
          <div id="reply-composer" className="lg:mt-1">
            {composerWrapper}
          </div>
        )}
        {node.children.length > 0 &&
          (node.depth < MAX_THREAD_DEPTH - 1 ? (
            // Riel de sangría CORTA (~16px/nivel), HERMANO de la fila (no dentro
            // de la columna de texto) — así el ancho del avatar no se acumula por
            // nivel y el rail baja desde el avatar del padre, estilo Reddit.
            <div className="ml-1 flex flex-col gap-1 border-l-2 border-border pl-3">
              {node.children.map(renderNode)}
            </div>
          ) : (
            // Tope de sangría (MAX_THREAD_DEPTH): más adentro no se sangra; los
            // hijos siguen al mismo nivel con la cabecera «↳ En respuesta a
            // @usuario» dando el contexto de a quién responden.
            <div className="flex flex-col gap-1">{node.children.map(renderNode)}</div>
          ))}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Barra de acciones del post + contador (cabecera del hilo). */}
      <div className="flex items-center gap-5 border-y border-border py-3 text-[13px]">
        <ReactionBar
          reactions={state.reactions}
          disabled={isPending || !viewerLoggedIn}
          onToggle={(emoji) =>
            run({ type: "toggleTarget", emoji }, async () => {
              await toggleReaction(interactionTargetId, emoji);
            })
          }
        />
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CommentIcon className="h-4 w-4" />
          {t("commentsCount", { count: state.commentCount })}
        </span>
      </div>

      {viewerLoggedIn ? (
        // Cabecera del hilo = composer RAÍZ (comentario nuevo), SOLO cuando no se
        // responde: al responder, el composer salta inline bajo el comentario
        // (renderNode). En móvil el wrapper es `fixed` abajo en ambos casos.
        !replyingTo && composerWrapper
      ) : (
        <Link href={loginHref(pathname)} className="rounded-xl border border-border bg-surface px-3.5 py-3 text-[13px] text-muted-foreground hover:text-foreground">
          {t("writeComment")}
        </Link>
      )}

      {nodes.length > 1 && (
        <div className="flex items-center gap-1 text-[11.5px]">
          <button
            type="button"
            aria-pressed={sort === "recent"}
            onClick={() => setSort("recent")}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${sort === "recent" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("sortRecent")}
          </button>
          <button
            type="button"
            aria-pressed={sort === "top"}
            onClick={() => setSort("top")}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${sort === "top" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("sortTop")}
          </button>
        </div>
      )}

      {/* El árbol. El aire para que el composer fijo (móvil) no tape lo último
          lo pone AHORA la página (`/post/[id]`), porque bajo el hilo va el raíl
          de contexto: el `pb` tiene que estar en el último bloque de la
          columna, no aquí. */}
      <div className="flex flex-col gap-1">
        {nodes.map(renderNode)}
        {voice.pending.map((note) => (
          <PendingVoiceNoteRow key={note.localId} note={note} onRetry={voice.retry} onDiscard={voice.discard} />
        ))}
      </div>

      {failed && (
        <p role="alert" className="text-xs text-status-dropped">
          {t("actionError")}
        </p>
      )}

      <VoiceMiniBar />
    </section>
  );
}
