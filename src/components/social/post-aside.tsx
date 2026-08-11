"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RelatedPost } from "@/lib/social/feed";
import { UserAvatar } from "./user-avatar";
import { SpineCover } from "./spine-cover";

// Raíl de contexto de `/post/[id]` (posts Spec 2b, Propuesta B): rellena la
// página del post —que era post + hilo y quedaba vacía— con descubrimiento.
// Participantes (de los comentarios ya cargados), "Más del autor" y "Más sobre
// la obra" (dos consultas en `getPostContext`), y el enlace al perfil. En
// escritorio es un raíl derecho pegajoso; en móvil cae bajo el hilo con las
// listas de descubrimiento como CARRUSELES horizontales (mockup Propuesta B).
export type AsideParticipant = { id: string; name: string; avatarUrl: string | null };

const LABEL_CLASS =
  "mb-2.5 font-mono text-[9.5px] tracking-[0.09em] uppercase text-muted-foreground";
const CARD_CLASS = "rounded-xl border border-border bg-surface p-3.5";

export function PostAside({
  authorUsername,
  authorName,
  workTitle,
  participants,
  participantCount,
  moreByAuthor,
  moreAboutWork,
}: {
  authorUsername: string;
  authorName: string;
  workTitle: string;
  participants: AsideParticipant[];
  participantCount: number;
  moreByAuthor: RelatedPost[];
  moreAboutWork: RelatedPost[];
}) {
  const t = useTranslations("social");

  // El sticky y el ancho del raíl los pone la rejilla `.post-grid` (área
  // "social"), no este componente — así el salto a columna (1000px) y el pegado
  // se deciden en un solo sitio, junto a los otros dos raíles.
  return (
    <aside className="flex flex-col gap-3">
      {participants.length > 0 && (
        <div className={CARD_CLASS}>
          <p className={LABEL_CLASS}>{t("participants")}</p>
          <div className="flex items-center gap-3">
            <div className="flex">
              {participants.slice(0, 5).map((p) => (
                <div key={p.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
                  <UserAvatar name={p.name} avatarUrl={p.avatarUrl} size={28} />
                </div>
              ))}
            </div>
            <span className="min-w-0 text-[12px] text-muted-foreground">
              {t("participantsCount", { count: participantCount })}
            </span>
          </div>
        </div>
      )}

      {moreByAuthor.length > 0 && (
        <RelatedSection title={t("moreByAuthor", { name: authorName })} posts={moreByAuthor} facet="work" />
      )}

      {moreAboutWork.length > 0 && (
        <RelatedSection title={t("moreAboutWork", { title: workTitle })} posts={moreAboutWork} facet="author" />
      )}

      <Link
        href={`/u/${authorUsername}`}
        className="rounded-xl border border-border bg-surface px-3.5 py-3 text-center text-[13px] font-medium transition-colors hover:bg-surface-muted"
      >
        {t("viewProfile", { name: authorName })} →
      </Link>
    </aside>
  );
}

// `facet`: "work" pinta la obra (portada + título) — para "Más del autor";
// "author" pinta a quien publicó (avatar + nombre) — para "Más sobre la obra".
// El texto secundario es siempre el tipo de post (Reseña, Pensamiento…). Cada
// mini-card enlaza al post, no a la obra: el descubrimiento lleva a la
// conversación. Carrusel horizontal en móvil, lista vertical en el raíl.
function RelatedSection({
  title,
  posts,
  facet,
}: {
  title: string;
  posts: RelatedPost[];
  facet: "work" | "author";
}) {
  const t = useTranslations("social");
  // Carrusel horizontal cuando el raíl cae al flujo (<1023, todos los ítems con
  // scroll); lista vertical en el raíl (≥1023, mismo salto que `.post-grid`). No
  // hay degradación del nº de ítems por ancho: mientras el raíl es visible
  // muestra todos (decisión 2026-08-11).
  return (
    <div className={CARD_CLASS}>
      <p className={LABEL_CLASS}>{title}</p>
      <div className="related-list flex gap-2.5 overflow-x-auto pb-1 min-[1023px]:flex-col min-[1023px]:gap-1 min-[1023px]:overflow-visible min-[1023px]:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {posts.map((p) => {
          const primary = facet === "work" ? p.itemTitle : p.authorDisplayName || p.authorUsername;
          return (
            <Link
              key={p.postId}
              href={`/post/${p.postId}`}
              className="flex w-[92px] shrink-0 flex-col gap-1.5 rounded-lg transition-opacity hover:opacity-80 min-[1023px]:w-auto min-[1023px]:flex-row min-[1023px]:items-center min-[1023px]:gap-2.5 min-[1023px]:rounded-none min-[1023px]:px-0 min-[1023px]:py-1"
            >
              {facet === "work" ? (
                <SpineCover
                  coverUrl={p.itemCoverUrl}
                  title={p.itemTitle}
                  className="aspect-[2/3] w-full min-[1023px]:w-9 min-[1023px]:shrink-0"
                />
              ) : (
                <div className="self-start min-[1023px]:self-auto">
                  <UserAvatar name={primary} avatarUrl={p.authorAvatarUrl} size={36} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-serif text-[12.5px] leading-tight font-semibold text-foreground min-[1023px]:truncate">
                  {primary}
                </p>
                <p className="mt-0.5 font-mono text-[9px] tracking-[0.05em] uppercase text-muted-foreground">
                  {t(`relatedKind.${p.kind}`)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
