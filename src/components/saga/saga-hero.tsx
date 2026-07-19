import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { sagaHref } from "@/lib/catalog/item-href";
import { SagaFollowButton } from "./saga-follow-button";

// Hero de la ficha de saga (frames A/D): abanico de portadas, título, byline,
// chips, progreso segmentado por subsaga y seguir. Server component; solo el
// botón de seguir es isla cliente (ver saga-follow-button.tsx). Vocabulario de
// clases calcado de item-hero.tsx / hero-status-or-follow.tsx: font-serif +
// font-mono, shadow-cover + rounded-cover para portadas, bg-surface-muted
// para superficies hundidas, bg-accent/text-accent-foreground para el CTA.
const FAN_TRANSFORMS = [
  "-translate-x-1/2 -rotate-[16deg] translate-y-1.5",
  "-translate-x-1/2 -rotate-6 -translate-y-0.5",
  "-translate-x-1/2 rotate-6 -translate-y-0.5",
  "-translate-x-1/2 rotate-[16deg] translate-y-1.5",
];

export async function SagaHero({
  detail,
  isAuthenticated,
}: {
  detail: SagaDetail;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("saga");
  const { saga, parent, byline, groups, memberCount, childCount, progress, avgRating } = detail;

  const fanCovers = groups
    .flatMap((g) => g.members)
    .filter((m) => m.coverUrl)
    .slice(0, 4);

  return (
    <header className="flex flex-col items-center gap-3 px-4 pt-2 text-center">
      <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-accent uppercase">
        {t("eyebrow")} · {t("count", { count: memberCount })}
      </p>

      {fanCovers.length > 0 && (
        <div className="relative h-[132px] w-full">
          {fanCovers.map((m, i) => (
            <div
              key={`${m.itemType}-${m.itemId}`}
              className={`absolute top-1 left-1/2 h-[117px] w-[78px] origin-bottom overflow-hidden rounded-cover border border-border shadow-cover ${FAN_TRANSFORMS[i] ?? ""}`}
            >
              <Image src={m.coverUrl!} alt="" fill sizes="78px" className="object-cover" />
            </div>
          ))}
        </div>
      )}

      <h1 className="font-serif text-[27px] leading-[1.05] font-semibold tracking-tight">
        {saga.name}
      </h1>
      {byline && (
        <p className="font-serif text-sm text-muted-foreground italic">
          {t("by", { name: byline })}
        </p>
      )}
      {parent && (
        <Link
          href={sagaHref(parent.id)}
          className="rounded-full bg-surface-muted px-3 py-1 font-mono text-[10px] text-muted-foreground"
        >
          {t("partOf", { name: parent.name })}
        </Link>
      )}

      <div className="flex flex-wrap justify-center gap-1.5">
        <span className="rounded-full bg-surface-muted px-2.5 py-1 font-mono text-[10px]">
          {t("count", { count: memberCount })}
        </span>
        {childCount > 0 && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 font-mono text-[10px]">
            {t("subsagas", { count: childCount })}
          </span>
        )}
        {avgRating !== null && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 font-mono text-[10px]">
            {t("avgRating", { rating: avgRating })}
          </span>
        )}
      </div>

      {isAuthenticated && progress.total > 0 && (
        <div className="w-full max-w-sm">
          <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10.5px] text-muted-foreground">
            <span>{t("yourProgress")}</span>
            <b className="font-serif text-[15px] font-semibold text-accent">{progress.pct}%</b>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
            {progress.segments.map((s, i) => (
              <i
                key={i}
                className={`block h-full ${SAGA_ACCENT[s.accent].bg}`}
                style={{ width: `${s.fraction * 100}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {isAuthenticated && (
        <SagaFollowButton sagaId={saga.id} isFollowing={detail.isFollowing} />
      )}
    </header>
  );
}
