import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { sagaHref } from "@/lib/catalog/item-href";
import { formatDots } from "@/lib/rating/dots";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";
import { SagaFollowButton } from "@/components/saga/saga-follow-button";
import { pickSagaHeroBackground } from "./hero-background";

// Hero cinemático de la ficha de saga (spec 2026-10-27 §1). Un solo árbol
// para móvil y PC, como `ItemHero`. Nunca hay texto sobre imagen nítida: el
// degradado llega a --background antes del bloque de título.
export async function SagaHeroCinematic({
  detail,
  backdropUrl,
  curatorMenu,
}: {
  detail: SagaDetail;
  backdropUrl: string | null;
  curatorMenu: ReactNode;
}) {
  const t = await getTranslations("saga");
  const { saga, parent, byline, memberCount, childCount, avgRating } = detail;
  const members = detail.groups.flatMap((g) => g.members);
  const covers = members.map((m) => m.coverUrl).filter((u): u is string => u !== null);
  const bg = pickSagaHeroBackground({ backdropUrl, covers });
  const years = members.map((m) => m.year).filter((y): y is number => y !== null);
  const span = years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : null;

  return (
    <div className="relative" data-testid="saga-hero">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[260px] overflow-hidden sm:h-[300px] lg:h-[380px]">
        {bg.kind === "backdrop" && (
          <Image src={bg.src} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className="object-cover object-[center_25%]" />
        )}
        {bg.kind === "mosaic" && (
          <div data-testid="saga-hero-mosaic" className="absolute -inset-6 grid scale-110 grid-cols-4 gap-1 opacity-70 blur-md sm:grid-cols-6">
            {bg.covers.map((src, i) => (
              <div key={i} className="relative aspect-[2/3]">
                <Image src={src} alt="" fill sizes="120px" className="object-cover" />
              </div>
            ))}
          </div>
        )}
        {bg.kind === "none" && <div className="absolute inset-0 bg-surface-muted" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-10% via-background/85 via-45% to-background to-70%" />
      </div>

      <header className={`relative ${DETAIL_CONTAINER} flex flex-col gap-2 pt-[120px] pb-4 sm:pt-[150px] lg:pt-[210px]`}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-accent uppercase">
            {childCount > 0 ? t("eyebrowUniverse") : t("eyebrow")} · {t("count", { count: memberCount })}
            {childCount > 0 && <> · {t("subsagas", { count: childCount })}</>}
          </p>
          {curatorMenu}
        </div>
        <h1 className="[overflow-wrap:anywhere] font-serif text-[30px] leading-[1.03] font-semibold sm:text-[38px] lg:text-[48px]">
          {saga.name}
        </h1>
        <p className="font-serif text-sm text-foreground-soft italic lg:text-lg">
          {/* `formatDots`, NO `avgRating` en crudo: `averageSagaRating` devuelve
              la escala de guardado (1–10) y se enseña sobre 5 como el resto de
              la app (issue #643). `!`: en esta rama `avgRating` ya es `number`. */}
          {[byline && t("by", { name: byline }), span, avgRating !== null && t("avgRating", { rating: formatDots(avgRating)! })]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {parent && (
            <Link href={sagaHref(parent.id)} className="rounded-full bg-surface-muted px-3 py-1 font-mono text-[10px] text-muted-foreground">
              {t("partOf", { name: parent.name })}
            </Link>
          )}
          {detail.isAuthenticated && <SagaFollowButton sagaId={saga.id} isFollowing={detail.isFollowing} />}
        </div>
      </header>
    </div>
  );
}
