import Image from "next/image";
import { createContext, Suspense, use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";
import type { ShelfGroup, ShelfSlot, ShelfWork } from "@/lib/sagas/derive-shelf";

// Piezas presentacionales de la balda (spec 2026-10-27 §2). Sin estado propio.

/** Promesa con tus notas (1–10) por clave de nodo; null sin sesión. */
export const ShelfRatingsContext = createContext<Promise<Record<string, number>> | null>(null);

/** Tu nota bajo una portada leída: cinco puntos, los llenos redondeados al
 *  entero más cercano de la escala de 5. Llega por Suspense cuando termina la
 *  lectura de tus pases, sin frenar la balda. */
function CoverRating({ workKey }: { workKey: string }) {
  const promise = use(ShelfRatingsContext);
  if (!promise) return null;
  return (
    <Suspense fallback={null}>
      <RatingDotsRow promise={promise} workKey={workKey} />
    </Suspense>
  );
}

function RatingDotsRow({ promise, workKey }: { promise: Promise<Record<string, number>>; workKey: string }) {
  const t = useTranslations("saga");
  const rating = use(promise)[workKey];
  if (rating === undefined) return null;
  const filled = Math.round(rating / 2);
  return (
    <span data-testid="shelf-rating" className="flex gap-0.5" title={t("shelfYourRating", { rating: (rating / 2).toLocaleString("es-ES", { maximumFractionDigits: 1 }) })}>
      {[1, 2, 3, 4, 5].map((k) => (
        <span key={k} aria-hidden className={`block h-1 w-1 rounded-full ${k <= filled ? "bg-gold" : "bg-surface-muted"}`} />
      ))}
      <span className="sr-only">{t("shelfYourRating", { rating: (rating / 2).toLocaleString("es-ES", { maximumFractionDigits: 1 }) })}</span>
    </span>
  );
}

export function Pile({ group, label, onOpen }: { group: ShelfGroup; label: string; onOpen: () => void }) {
  const tick = group.state === "done" ? " ✓" : "";
  const count = group.state === "future" ? `${group.counted}` : `${group.completed}/${group.counted}`;
  const covers: Array<string | null> = group.pileCovers.length > 0 ? group.pileCovers : [null, null, null];
  return (
    <button
      type="button"
      data-testid={`shelf-pile-${group.key}`}
      onClick={onOpen}
      className={`flex shrink-0 snap-center flex-col items-center gap-1 ${group.state === "future" ? "opacity-60" : ""}`}
    >
      <span className="relative block h-[84px] w-[80px] sm:h-[102px] sm:w-[94px]">
        {covers.map((src, i) => (
          <span
            key={i}
            style={{ left: i * 9, bottom: i * 4 }}
            className={`absolute block h-[75px] w-[50px] overflow-hidden rounded-[3px] shadow-cover sm:h-[93px] sm:w-[62px] ${group.state === "done" ? "outline-2 outline-green" : ""} ${src ? "" : SAGA_ACCENT[group.accent].bg}`}
          >
            {src && <Image src={src} alt="" fill sizes="62px" className="object-cover" />}
          </span>
        ))}
      </span>
      <span className="max-w-[110px] truncate font-mono text-[10px] text-muted-foreground">
        {label} · {count}
        {tick}
      </span>
    </button>
  );
}

export function OpenGroup({ group, label, showLabel }: { group: ShelfGroup; label: string; showLabel: boolean }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {showLabel && (
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
          {label} · {group.completed}/{group.counted}
        </span>
      )}
      <div className="flex items-end gap-4 border-b-[3px] border-surface-muted pb-1.5">
        {/* Dos filas: la 1 para los arcos de ventana, la 2 para las portadas. */}
        <div className="grid auto-cols-max grid-flow-col grid-rows-[auto_auto] items-end gap-x-2">
          {group.slots.map(
            (s, i) =>
              s.kind === "window" &&
              s.spanFrom !== null &&
              s.spanTo !== null && (
                <span
                  key={`arc-${i}`}
                  aria-hidden
                  style={{ gridColumn: `${s.spanFrom + 1} / ${s.spanTo + 2}`, gridRow: 1 }}
                  className="mb-1 h-3 rounded-t-lg border-x-[1.5px] border-t-[1.5px] border-dashed border-map-window"
                />
              ),
          )}
          {group.slots.map((s, i) => (
            <div key={i} style={{ gridColumn: i + 1, gridRow: 2 }} className="snap-center">
              <SlotView slot={s} accent={group.accent} />
            </div>
          ))}
        </div>
        {group.extras.length > 0 && (
          <div className="flex items-end gap-1.5 border-l border-border pl-3">
            {group.extras.map((x) => (
              <Cover key={x.key} work={x} accent={group.accent} small />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotView({ slot, accent }: { slot: ShelfSlot; accent: SagaAccentToken }) {
  const t = useTranslations("saga");
  if (slot.kind === "work") return <Cover work={slot.work} accent={accent} />;
  if (slot.kind === "tandem")
    return (
      <div className="relative flex">
        {slot.works.map((w, i) => (
          <div key={w.key} className={i > 0 ? "-ml-5" : ""}>
            <Cover work={w} accent={accent} ring="outline-2 outline-map-tandem" />
          </div>
        ))}
        <Tag text={t("shelfTandem")} />
      </div>
    );
  return (
    <div className="relative -translate-y-4">
      <Cover work={slot.work} accent={accent} ring="outline-2 outline-dashed outline-map-window" />
      <Tag text={t("shelfWindow")} />
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span
      aria-hidden
      className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-1.5 font-mono text-[8px] whitespace-nowrap text-muted-foreground"
    >
      {text}
    </span>
  );
}

function Cover({ work, ring, small, accent }: { work: ShelfWork; ring?: string; small?: boolean; accent: SagaAccentToken }) {
  const t = useTranslations("saga");
  const size =
    work.state === "now"
      ? "h-[126px] w-[84px] sm:h-[156px] sm:w-[104px]"
      : small
        ? "h-[66px] w-[44px] sm:h-[78px] sm:w-[52px]"
        : "h-[90px] w-[60px] sm:h-[114px] sm:w-[76px]";
  const state =
    work.state === "now" ? "outline-[3px] outline-accent" : work.state === "done" ? "outline-2 outline-green" : "opacity-55";
  // Tándem y ventana mandan sobre el contorno de estado; «ahora» y «leída»
  // siguen distinguiéndose por la etiqueta y el ✓, que no dependen del contorno.
  // Debajo, una fila de 4 px para tu nota: existe en TODAS las portadas para
  // que las leídas no queden más altas que el resto (la fila es items-end).
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
    <Link
      href={work.href}
      data-shelf-link
      data-testid={work.state === "now" ? "shelf-now" : undefined}
      title={work.title}
      className={`relative block shrink-0 overflow-hidden rounded-[4px] shadow-cover outline-offset-1 ${size} ${ring ?? state} ${work.state === "todo" && ring ? "opacity-55" : ""} ${work.skipped ? "grayscale" : ""}`}
    >
      {work.coverUrl ? (
        <Image src={work.coverUrl} alt={work.title} fill sizes="104px" className="object-cover" />
      ) : (
        <span
          className={`flex h-full items-center justify-center p-1 text-center text-[9px] leading-tight text-background [writing-mode:vertical-rl] ${SAGA_ACCENT[accent].bg}`}
        >
          {work.title}
        </span>
      )}
      {work.state === "done" && (
        <span aria-hidden className="absolute top-0.5 right-0.5 rounded-full bg-green px-1 text-[9px] text-background">
          ✓
        </span>
      )}
      {work.state === "now" && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center font-mono text-[8px] tracking-wider text-accent-foreground uppercase"
        >
          {t("shelfNowTag")}
        </span>
      )}
      {work.skipped && (
        <span aria-hidden className="absolute right-0.5 bottom-0.5 rounded-full bg-surface/90 px-1 font-mono text-[7px] text-muted-foreground">
          {t("shelfSkipped")}
        </span>
      )}
      {work.role && (
        <span aria-hidden className="absolute top-0.5 left-0.5 rounded-full bg-surface/90 px-1 font-mono text-[7px] text-muted-foreground">
          {t(`roleLabel.${work.role}`)}
        </span>
      )}
    </Link>
      <span className="flex h-1 items-center">{work.state === "done" && <CoverRating workKey={work.key} />}</span>
    </div>
  );
}
