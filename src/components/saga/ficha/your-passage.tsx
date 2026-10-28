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

  const rated = p.distribution.reduce((n, d) => n + d.works.length, 0);
  const maxCount = Math.max(1, ...p.distribution.map((d) => d.works.length));
  // Nivel más repetido; el empate lo gana el más alto (es el que se lee primero).
  const mostly = p.distribution.reduce((best, d) => (d.works.length > best.works.length ? d : best));

  return (
    <section className="rounded-[14px] border border-border bg-surface p-5" data-testid="your-passage">
      <h2 className="font-serif text-xl font-semibold">{t("passageTitle", { name: sagaName })}</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{f.label}</dt>
                <dd className="mt-1 font-serif text-2xl leading-none font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
          {p.favorite && (
            <Link
              href={p.favorite.href}
              className="flex items-center gap-3 rounded-xl bg-surface-muted p-3 transition-colors hover:bg-surface-3"
            >
              <span className="relative block h-[66px] w-[44px] shrink-0 overflow-hidden rounded-[3px] bg-surface-3 shadow-cover">
                {p.favorite.coverUrl && <Image src={p.favorite.coverUrl} alt="" fill sizes="44px" className="object-cover" />}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{t("passageFavoriteLabel")}</span>
                <span className="truncate font-serif text-base font-semibold">{p.favorite.title}</span>
                <RatingDots value={p.favorite.rating} size="sm" />
              </span>
            </Link>
          )}
        </div>

        {/* «Cómo has puntuado esta saga» (sustituye a la curva, que no se
            entendía): tus obras con nota por nivel, de 5 a 1, con una barra
            proporcional. Qué nota le diste a cada obra ya lo dice la balda. */}
        {p.curve.length >= 2 && (
          <div data-testid="passage-distribution">
            <h3 className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("passageDistributionTitle")}
            </h3>
            <p className="mt-1 text-sm text-foreground-soft">
              {t("passageRated", { count: rated })} · {t("passageMostly", { level: mostly.level })}
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {p.distribution.map((d) => (
                <li
                  key={d.level}
                  className={`grid grid-cols-[56px_minmax(0,1fr)_28px] items-center gap-3 ${d.works.length > 0 ? "min-h-[50px]" : "min-h-[22px]"}`}
                  aria-label={t("passageDistributionLevel", { level: d.level, count: d.works.length })}
                >
                  <span aria-hidden className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((k) => (
                      <span key={k} className={`block h-1.5 w-1.5 rounded-full ${k <= d.level ? "bg-gold" : "bg-surface-3"}`} />
                    ))}
                  </span>
                  <span className="relative flex min-w-0 items-center">
                    {/* Pista de fondo con la barra proporcional; las portadas van encima. */}
                    <span aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full bg-gold/60" style={{ width: `${(d.works.length / maxCount) * 100}%` }} />
                    </span>
                    {d.works.slice(0, MAX_STACK).map((w, i) => (
                      <Link
                        key={w.key}
                        href={w.href}
                        title={w.title}
                        className={`relative block h-[45px] w-[30px] shrink-0 overflow-hidden rounded-[3px] border border-surface bg-surface-3 shadow-cover ${i > 0 ? "-ml-2" : ""}`}
                      >
                        {w.coverUrl && <Image src={w.coverUrl} alt={w.title} fill sizes="30px" className="object-cover" />}
                      </Link>
                    ))}
                    {d.works.length > MAX_STACK && (
                      <span className="relative ml-2 rounded-full bg-surface px-1.5 font-mono text-[10px] text-muted-foreground">
                        +{d.works.length - MAX_STACK}
                      </span>
                    )}
                  </span>
                  <span aria-hidden className={`text-right font-serif text-base font-semibold ${d.works.length > 0 ? "" : "text-muted-foreground"}`}>
                    {d.works.length}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function YourPassageSkeleton() {
  return (
    <div className="h-[260px]" data-testid="your-passage-skeleton">
      <Skeleton className="size-full rounded-[14px]" />
    </div>
  );
}
