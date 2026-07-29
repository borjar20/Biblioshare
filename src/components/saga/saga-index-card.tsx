import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SagaIndexCard as SagaIndexCardData } from "@/lib/sagas/build-saga-index";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SagaFollowButton } from "@/components/saga/saga-follow-button";
import { collapseSagaChildren } from "@/lib/sagas/collapse-saga-children";

const MAX_VISIBLE_CHILDREN = 2;
const TYPE_ORDER = ["book", "movie", "series"] as const;

export async function SagaIndexCard({
  card,
  isAuthenticated,
}: {
  card: SagaIndexCardData;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("sagaIndex");
  const tSaga = await getTranslations("saga");
  const { visible, hiddenCount } = collapseSagaChildren(card.children, MAX_VISIBLE_CHILDREN);
  const isUniverse = card.children.length > 0;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {/* Portada o placeholder con el acento de la saga. El Link va en
            portada+nombre, no en la tarjeta entera: el botón Seguir no puede
            anidarse dentro de un enlace. */}
        <Link href={`/saga/${card.id}`} className="shrink-0">
          {card.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.coverUrl}
              alt=""
              className="h-[84px] w-[56px] rounded-md object-cover"
            />
          ) : (
            <span
              aria-hidden
              className={`block h-[84px] w-[56px] rounded-md opacity-80 ${SAGA_ACCENT[card.accent].bg}`}
            />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <Link
              href={`/saga/${card.id}`}
              className="truncate font-serif text-[15.5px] font-semibold hover:underline"
            >
              {card.name}
            </Link>
            {isUniverse && (
              <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-muted-foreground uppercase">
                {t("badgeUniverse")}
              </span>
            )}
            {card.hasGraph && (
              <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-gold uppercase">
                {t("badgeGraph")}
              </span>
            )}
            {card.routeCount > 0 && (
              <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-accent uppercase">
                {t("badgeItineraries", { count: card.routeCount })}
              </span>
            )}
          </div>

          <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
            {tSaga("count", { count: card.titleCount })}
            {card.children.length > 0 && ` · ${tSaga("subsagas", { count: card.children.length })}`}
          </span>

          {(card.typeBreakdown.book > 0 || card.typeBreakdown.movie > 0 || card.typeBreakdown.series > 0) && (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
              {TYPE_ORDER.filter((type) => card.typeBreakdown[type] > 0).map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${MEDIA_ACCENT[type].bg}`} />
                  {t(`typeCount.${type}`, { count: card.typeBreakdown[type] })}
                </span>
              ))}
            </span>
          )}

          {card.children.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {visible.map((child) => (
                <Link
                  key={child.id}
                  href={`/saga/${child.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span aria-hidden className={`h-2 w-2 rounded-full ${SAGA_ACCENT[child.accent].bg}`} />
                  {child.name}
                </Link>
              ))}
              {hiddenCount > 0 && (
                <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  {t("moreSubsagas", { count: hiddenCount })}
                </span>
              )}
            </div>
          )}

          {card.ownedCount > 0 && (
            <span className="w-fit rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              {t("ownedCount", { count: card.ownedCount })}
            </span>
          )}

          {card.progress && card.progress.total > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className={`block h-full rounded-full ${SAGA_ACCENT[card.accent].bg}`}
                  style={{ width: `${card.progress.pct}%` }}
                />
              </div>
              <span className="font-mono text-[9.5px] whitespace-nowrap text-muted-foreground">
                {card.progress.completed}/{card.progress.total}
                {card.progress.readingLabel &&
                  ` · ${t("readingLabel", { name: card.progress.readingLabel })}`}
              </span>
            </div>
          )}
        </div>
      </div>
      {isAuthenticated && <SagaFollowButton sagaId={card.id} isFollowing={card.isFollowed} />}
    </article>
  );
}
