import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDots } from "@/lib/rating/dots";
import { statusVerbs } from "@/lib/library/hero-status-labels";
import type { ItemType } from "@/lib/catalog/types";
import type { WorkSummary } from "@/lib/social/work-summary";
import { SpineCover } from "./spine-cover";
import { RatingDots } from "@/components/ui/rating-dots";

// Área OBRA de `/post/[id]`: resumen CONTEXTUAL de la obra del post (no la
// ficha). Server component —usa `getTranslations`— con `RatingDots`/`SpineCover`
// como hojas. La degradación por ancho NO oculta el bloque de golpe: reduce el
// detalle progresivamente con variantes `min-[Npx]:` (los mismos saltos que la
// rejilla `.post-grid`), quedando:
//   ≥1440  portada · título · tipo·año · creador · nota comunidad · tu nota ·
//          tu estado · géneros · CTA
//   ≥1180  portada · título · tipo·año · creador · nota comunidad · CTA
//   ≥1000  portada · título · año · CTA
// La portada escala sola con el ancho de la columna (180→250px), sin sizing por
// breakpoint. Bajo 1000 la columna entera desaparece (la oculta `.post-grid`);
// ahí la obra se alcanza por la tarjeta vinculada DENTRO del post.
const CARD = "rounded-xl border border-border bg-surface p-3.5";
const LABEL = "font-mono text-[9.5px] tracking-[0.09em] uppercase text-muted-foreground";

const isCatalog = (t: WorkSummary["type"]): t is ItemType =>
  t === "book" || t === "movie" || t === "series";

export async function WorkSummaryCard({ work }: { work: WorkSummary }) {
  const tDetail = await getTranslations("detail");
  // `itemType` (no un booleano) para que TS estreche book/movie/series en los
  // props que exigen `ItemType` (RatingDots, statusVerbs, mediaLabel).
  const itemType = isCatalog(work.type) ? work.type : null;
  const typeLabel = itemType ? tDetail(`mediaLabel.${itemType}`) : null;
  const verbs = itemType ? await statusVerbs(itemType) : null;

  // "tipo · año" — el "tipo ·" solo a partir de 1180; a 1000–1179 queda el año.
  const yearText = work.year != null ? String(work.year) : null;

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <Link href={work.href} className="block transition-opacity hover:opacity-90">
        <SpineCover
          coverUrl={work.coverUrl}
          title={work.title}
          className="aspect-[2/3] w-full"
        />
      </Link>

      <div className="flex flex-col gap-1.5">
        <Link href={work.href} className="hover:underline">
          <h2 className="font-serif text-[15px] leading-tight font-semibold text-foreground [overflow-wrap:anywhere]">
            {work.title}
          </h2>
        </Link>

        {(typeLabel || yearText) && (
          <p className="font-mono text-[10px] tracking-[0.05em] uppercase text-muted-foreground">
            {typeLabel && <span className="hidden min-[1180px]:inline">{typeLabel}</span>}
            {typeLabel && yearText && <span className="hidden min-[1180px]:inline"> · </span>}
            {yearText}
          </p>
        )}

        {/* Creador: solo ≥1180. */}
        {work.creator && (
          <p className="hidden min-[1180px]:block text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">
            {work.creator}
          </p>
        )}
      </div>

      {/* Valoración de la comunidad: ≥1180. */}
      {itemType && work.community && (
        <div className="hidden min-[1180px]:flex items-center gap-2">
          {work.community.avgRating !== null ? (
            <>
              <RatingDots value={work.community.avgRating} size="sm" itemType={itemType} />
              <span className="text-[12px] font-medium text-foreground">
                {formatDots(work.community.avgRating)}
              </span>
            </>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {tDetail("ratings", { count: work.community.ratingCount })}
          </span>
        </div>
      )}

      {/* Tu estado / tu nota / géneros: solo ≥1440. */}
      {itemType && (work.viewer || work.genres.length > 0) && (
        <div className="hidden min-[1440px]:flex flex-col gap-2.5 border-t border-border pt-3">
          {work.viewer && verbs && (
            <div className="flex flex-col gap-1.5">
              <p className={LABEL}>{tDetail("inLibrary")}</p>
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-foreground">{verbs[work.viewer.status]}</span>
                {work.viewer.rating !== null && (
                  <RatingDots value={work.viewer.rating} size="sm" itemType={itemType} />
                )}
              </div>
            </div>
          )}
          {work.genres.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className={LABEL}>{tDetail("genres")}</p>
              <div className="flex flex-wrap gap-1.5">
                {work.genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10.5px] text-muted-foreground"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Link
        href={work.href}
        className="mt-0.5 text-[12.5px] font-medium text-foreground transition-colors hover:text-muted-foreground"
      >
        {tDetail("viewFullWork")} →
      </Link>
    </div>
  );
}
