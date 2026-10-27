import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { RatingDots } from "@/components/ui/rating-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDots } from "@/lib/rating/dots";
import type { Passage } from "@/lib/sagas/passage";

// «Tu paso por la saga» (spec 2026-10-27 §1.5). Espera la promesa dentro del
// <Suspense> de la página: sin pases (o sin sesión) llega null y no se pinta.

/** Portadas que se apilan por nivel antes de resumir el resto en «+N». */
const MAX_STACK = 8;

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
  if (p.average !== null) {
    facts.push({ label: t("passageAverage"), value: t("ratingOutOf", { rating: formatDots(p.average) ?? "" }) });
  }
  if (p.optional) {
    facts.push({
      label: t("passageSkipped"),
      value: t("passageSkippedValue", { skipped: p.optional.skipped, total: p.optional.total }),
    });
  }

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
      {/* «Cómo has puntuado esta saga» (sustituye a la curva, que no se
          entendía): tus obras con nota agrupadas por nivel, de 5 a 1. Qué
          nota le diste a cada obra ya lo dice la balda, bajo cada portada. */}
      {p.curve.length >= 2 && (
        <div className="mt-4" data-testid="passage-distribution">
          <h3 className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {t("passageDistributionTitle")}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {p.distribution.map((d) => (
              <li key={d.level} className="flex items-center gap-3" aria-label={t("passageDistributionLevel", { level: d.level, count: d.works.length })}>
                <span aria-hidden className="flex w-[52px] shrink-0 gap-1">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <span key={k} className={`block h-1.5 w-1.5 rounded-full ${k <= d.level ? "bg-gold" : "bg-surface-muted"}`} />
                  ))}
                </span>
                <span className="flex min-h-[42px] items-center">
                  {d.works.slice(0, MAX_STACK).map((w, i) => (
                    <Link
                      key={w.key}
                      href={w.href}
                      title={w.title}
                      className={`relative block h-[42px] w-[28px] shrink-0 overflow-hidden rounded-[3px] border border-background bg-surface-muted shadow-cover ${i > 0 ? "-ml-2.5" : ""}`}
                    >
                      {w.coverUrl && <Image src={w.coverUrl} alt={w.title} fill sizes="28px" className="object-cover" />}
                    </Link>
                  ))}
                  {d.works.length > MAX_STACK && (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">+{d.works.length - MAX_STACK}</span>
                  )}
                </span>
                <span aria-hidden className="font-mono text-[11px] text-muted-foreground">{d.works.length > 0 ? d.works.length : ""}</span>
              </li>
            ))}
          </ul>
        </div>
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
