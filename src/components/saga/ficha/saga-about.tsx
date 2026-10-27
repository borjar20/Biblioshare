import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { formatDots } from "@/lib/rating/dots";

// «Sobre la saga» (spec 2026-10-27 §1.4): sinopsis + columna de datos, el
// mismo reparto `1fr | 340px` que la Info de la ficha de obra. El `340px`
// va literal en la clase porque Tailwind lo necesita en el fuente (ver el
// comentario de `HOME_TWO_COL` en `layout.ts`).
export async function SagaAbout({ detail, canConfigure }: { detail: SagaDetail; canConfigure: boolean }) {
  const t = await getTranslations("saga");
  const members = detail.groups.flatMap((g) => g.members);
  const byType = { book: 0, movie: 0, series: 0 };
  for (const m of members) byType[m.itemType] += 1;
  const years = members.map((m) => m.year).filter((y): y is number => y !== null);
  const unclassified = members.filter((m) => m.placement === null).length;
  // Tres claves plurales sueltas, unidas aquí: un único mensaje ICU dejaba un
  // « · » inicial cuando no había libros.
  const typesLine = [
    byType.book > 0 ? t("typeBooks", { count: byType.book }) : null,
    byType.movie > 0 ? t("typeMovies", { count: byType.movie }) : null,
    byType.series > 0 ? t("typeSeries", { count: byType.series }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="saga-about">
      <div>
        <h2 className="mb-2 font-serif text-xl font-semibold">{t("aboutTitle")}</h2>
        <p className="text-[14px] leading-relaxed text-foreground">{detail.saga.overview ?? t("noSynopsis")}</p>
        {canConfigure && unclassified > 0 && (
          <aside className="mt-4 flex items-start gap-2.5 rounded-xl border border-border px-3.5 py-3">
            <span className="text-[15px] text-muted-foreground">◇</span>
            <p className="text-xs leading-relaxed">
              {t("unclassifiedNotice", { count: unclassified })}{" "}
              <Link href={`/saga/${detail.saga.id}/editar`} className="font-semibold underline">
                {t("unclassifiedCta")}
              </Link>
            </p>
          </aside>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 self-start rounded-[14px] border border-border bg-surface p-4 text-sm">
        <dt className="text-muted-foreground">{t("aboutWorks")}</dt>
        <dd>{detail.memberCount}</dd>
        {typesLine && (
          <>
            <dt className="text-muted-foreground">{t("aboutTypes")}</dt>
            <dd>{typesLine}</dd>
          </>
        )}
        {years.length > 0 && (
          <>
            <dt className="text-muted-foreground">{t("aboutYears")}</dt>
            <dd>
              {Math.min(...years)}–{Math.max(...years)}
            </dd>
          </>
        )}
        {detail.avgRating !== null && (
          <>
            <dt className="text-muted-foreground">{t("aboutRating")}</dt>
            <dd>{formatDots(detail.avgRating)}</dd>
          </>
        )}
        {detail.childCount > 0 && (
          <>
            <dt className="text-muted-foreground">{t("aboutSubsagas")}</dt>
            <dd>{detail.childCount}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
