import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { RatingDots } from "@/components/ui/rating-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDots } from "@/lib/rating/dots";
import type { Passage } from "@/lib/sagas/passage";

// «Tu paso por la saga» (spec 2026-10-27 §1.5). Espera la promesa dentro del
// <Suspense> de la página: sin pases (o sin sesión) llega null y no se pinta.

const STEP = 24; // px de viewBox entre posiciones consecutivas de la balda
const HEIGHT = 60;

const nf = new Intl.NumberFormat("es-ES");
const sinceFormat = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

export async function YourPassage({ passage, sagaName }: { passage: Promise<Passage | null>; sagaName: string }) {
  const p = await passage;
  if (!p) return null;

  const t = await getTranslations("saga");
  const bold = { b: (chunks: ReactNode) => <b>{chunks}</b> };

  // «sobre X de Y» solo cuando faltan tallas en el catálogo.
  const partial = (s: { known: number; of: number }) =>
    s.known < s.of ? (
      <span className="block font-mono text-[10px] font-normal text-muted-foreground">
        {t("passageOfKnown", { known: s.known, of: s.of })}
      </span>
    ) : null;

  const facts: Array<{ label: string; value: ReactNode }> = [];
  if (p.since) {
    // Mediodía UTC: evita que la zona horaria desplace el día (y el mes).
    facts.push({ label: t("passageSince"), value: sinceFormat.format(new Date(`${p.since}T12:00:00Z`)) });
  }
  facts.push({ label: t("passageCompleted"), value: p.completed });
  if (p.inProgress > 0) facts.push({ label: t("passageInProgress"), value: p.inProgress });
  if (p.pages && p.pages.known > 0) {
    facts.push({
      label: t("passagePages"),
      value: (
        <>
          {nf.format(p.pages.total)}
          {partial(p.pages)}
        </>
      ),
    });
  }
  if (p.minutes && p.minutes.known > 0) {
    // Con preserveAspectRatio="none" un <circle> se estira; el punto es un trazo de longitud cero con cap redondo.
    // Horas enteras: se redondea el total de minutos al entero más cercano.
    const h = nf.format(Math.round(p.minutes.total / 60));
    facts.push({
      label: t("passageTime"),
      value: (
        <>
          {t("passageHours", { h })}
          {partial(p.minutes)}
        </>
      ),
    });
  }
  if (p.average !== null) facts.push({ label: t("passageAverage"), value: formatDots(p.average) });
  if (p.optional) {
    facts.push({
      label: t("passageSkipped"),
      value: t("passageSkippedValue", { skipped: p.optional.skipped, total: p.optional.total }),
    });
  }

  const W = Math.max(p.curveLength - 1, 1) * STEP;
  const pts = p.curve.map((c) => ({ x: c.x * STEP, y: 56 - ((c.rating - 1) / 9) * 52 }));
  const points = pts.map((q) => `${q.x},${q.y}`).join(" ");
  const label = t("passageCurveLabel", {
    list: p.curve.map((c) => `${c.title} ${formatDots(c.rating)}`).join(", "),
  });

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4" data-testid="your-passage">
      <h2 className="font-serif text-lg font-semibold">{t("passageTitle", { name: sagaName })}</h2>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{f.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold">{f.value}</dd>
          </div>
        ))}
      </dl>
      {p.favorite && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-foreground-soft">
          <Link href={p.favorite.href} className="underline-offset-2 hover:underline">
            {t.rich("passageFavorite", { title: p.favorite.title, ...bold })}
          </Link>
          <RatingDots value={p.favorite.rating} size="sm" />
        </div>
      )}
      {p.curve.length >= 2 && (
        <svg
          viewBox={`0 0 ${W} ${HEIGHT}`}
          role="img"
          aria-label={label}
          className="mt-3 h-[60px] w-full max-w-full overflow-visible text-accent"
          preserveAspectRatio="none"
        >
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {pts.map((q, i) => (
            <path
              key={i}
              d={`M${q.x} ${q.y}h0`}
              fill="none"
              stroke="currentColor"
              strokeWidth={6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </section>
  );
}

export function YourPassageSkeleton() {
  return (
    <div className="h-[120px]" data-testid="your-passage-skeleton">
      <Skeleton className="size-full rounded-[14px]" />
    </div>
  );
}
