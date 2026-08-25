import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SagaIndexCard as SagaIndexCardData } from "@/lib/sagas/build-saga-index";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SagaFollowButton } from "@/components/saga/saga-follow-button";
import { SagaSpineCover } from "@/components/saga/saga-spine-cover";
import { collapseSagaChildren } from "@/lib/sagas/collapse-saga-children";

// El mockup muestra hasta 5 chips de subsaga en escritorio y 2 en móvil. Se
// renderizan los 5 y los tres últimos se ocultan por CSS (no se duplica la
// lista), con dos contadores «+N» excluyentes por breakpoint.
const MAX_CHIPS_DESKTOP = 5;
const MAX_CHIPS_MOBILE = 2;
const TYPE_ORDER = ["book", "movie", "series"] as const;

// Insignias del mockup: verde = universo, dorado = curado a mano (grafo),
// acento = itinerarios. Nunca más de tres.
const BADGE = "shrink-0 rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-medium tracking-[0.09em] uppercase";

export async function SagaIndexCard({
  card,
  isAuthenticated,
}: {
  card: SagaIndexCardData;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("sagaIndex");
  const tSaga = await getTranslations("saga");

  const isUniverse = card.children.length > 0;
  const desktop = collapseSagaChildren(card.children, MAX_CHIPS_DESKTOP);
  const mobile = collapseSagaChildren(card.children, MAX_CHIPS_MOBILE);

  const types = TYPE_ORDER.filter((type) => card.typeBreakdown[type] > 0);
  const dominantType = types.reduce<(typeof TYPE_ORDER)[number] | null>(
    (best, type) => (best === null || card.typeBreakdown[type] > card.typeBreakdown[best] ? type : best),
    null,
  );

  // Reglas de estado del mockup (frame E): el progreso es cosa de las sagas
  // que SIGUES, y el chip «en tu colección» no se pinta en esas — ahí ya manda
  // la barra. Fuera de las seguidas, el chip es el puente entre «tengo cosas
  // sueltas» y «esto es una saga».
  const showProgress = card.isFollowed && card.progress !== null && card.progress.total > 0;
  const showOwned = !card.isFollowed && card.ownedCount > 0;

  return (
    <article
      // h-full: la tarjeta llena la celda de la rejilla, para que las de una
      // misma fila queden a la misma altura aunque tengan distintas líneas.
      className={`group relative flex h-full gap-3 rounded-xl border border-border bg-surface p-3 ${
        card.isFollowed ? "pl-[15px] shadow-[inset_3px_0_0_var(--accent)]" : ""
      }`}
    >
      {/* Portada. El Link va en portada+nombre, no en la tarjeta entera: el
          botón Seguir no puede anidarse dentro de un enlace. */}
      <Link href={`/saga/${card.id}`} tabIndex={-1} aria-hidden className="shrink-0">
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverUrl}
            alt=""
            className={`rounded-md object-cover ${isUniverse ? "h-24 w-16" : "h-[78px] w-[52px]"}`}
          />
        ) : (
          <SagaSpineCover
            name={card.name}
            accent={card.accent}
            className={isUniverse ? "h-24 w-16" : "h-[78px] w-[52px]"}
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* pr-7: deja sitio al icono de seguir de la esquina. */}
        <h3 className="flex flex-wrap items-baseline gap-x-[7px] gap-y-1 pr-7 font-serif text-[15.5px] leading-[1.22] font-semibold">
          <Link href={`/saga/${card.id}`} className="hover:text-accent">
            {card.name}
          </Link>
          {isUniverse && (
            <span className={`${BADGE} bg-green/15 text-green`}>{t("badgeUniverse")}</span>
          )}
          {card.hasGraph && (
            <span className={`${BADGE} bg-gold/15 text-gold-ink`}>{t("badgeGraph")}</span>
          )}
          {card.routeCount > 0 && (
            <span className={`${BADGE} bg-accent/10 text-accent`}>
              {t("badgeItineraries", { count: card.routeCount })}
            </span>
          )}
        </h3>

        {/* Línea meta: títulos · subsagas · autor. */}
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-[9.5px] tracking-[0.05em] text-muted-foreground uppercase">
          <span>{tSaga("count", { count: card.titleCount })}</span>
          {isUniverse && (
            <>
              <span aria-hidden className="text-border">·</span>
              <span>{tSaga("subsagas", { count: card.children.length })}</span>
            </>
          )}
          {card.creator && (
            <>
              <span aria-hidden className="text-border">·</span>
              <span className="truncate">{card.creator}</span>
            </>
          )}
        </p>

        {/* Desglose por medio, con los colores de --type-*. */}
        {types.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-[9px] gap-y-1 font-mono text-[9.5px] text-muted-foreground">
            {types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${MEDIA_ACCENT[type].bg}`} />
                {t(`typeCount.${type}`, { count: card.typeBreakdown[type] })}
              </span>
            ))}
          </p>
        )}

        {(isUniverse || showOwned) && (
          <div className="flex flex-wrap gap-[5px]">
            {desktop.visible.map((child, i) => (
              <Link
                key={child.id}
                href={`/saga/${child.id}`}
                // El display NO va en la clase común: `inline-flex` y `hidden`
                // son ambas utilities de display sin variante, y cuál gana lo
                // decide el orden de la hoja, no el del atributo class — con
                // las dos puestas el chip se seguía pintando en móvil.
                className={`items-center gap-[5px] rounded-md bg-surface-muted px-[7px] py-[3px] font-mono text-[9px] whitespace-nowrap text-muted-foreground hover:text-foreground ${
                  i >= MAX_CHIPS_MOBILE ? "hidden sm:inline-flex" : "inline-flex"
                }`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${SAGA_ACCENT[child.accent].bg}`} />
                {child.name} · {child.titleCount}
              </Link>
            ))}
            {mobile.hiddenCount > 0 && (
              <span className="inline-flex items-center rounded-md border border-dashed border-border px-[7px] py-[3px] font-mono text-[9px] whitespace-nowrap text-muted-foreground sm:hidden">
                {t("moreSubsagas", { count: mobile.hiddenCount })}
              </span>
            )}
            {desktop.hiddenCount > 0 && (
              <span className="hidden items-center rounded-md border border-dashed border-border px-[7px] py-[3px] font-mono text-[9px] whitespace-nowrap text-muted-foreground sm:inline-flex">
                {t("moreSubsagas", { count: desktop.hiddenCount })}
              </span>
            )}
            {showOwned && (
              <span
                className={`inline-flex items-center rounded-md bg-surface-muted px-[7px] py-[3px] font-mono text-[9px] whitespace-nowrap ${
                  dominantType ? MEDIA_ACCENT[dominantType].text : "text-muted-foreground"
                }`}
              >
                {t("ownedCount", { count: card.ownedCount })}
              </span>
            )}
          </div>
        )}

        {showProgress && card.progress && (
          <div className="flex max-w-[340px] items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${card.progress.pct}%` }}
              />
            </div>
            <span className="font-mono text-[9px] whitespace-nowrap text-muted-foreground uppercase">
              {card.progress.completed}/{card.progress.total}
              {card.progress.readingLabel &&
                ` · ${t("readingLabel", { name: card.progress.readingLabel })}`}
            </span>
          </div>
        )}
      </div>

      {isAuthenticated && (
        <SagaFollowButton sagaId={card.id} isFollowing={card.isFollowed} variant="icon" />
      )}
    </article>
  );
}
