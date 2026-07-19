import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibrarySagaCard as LibrarySagaCardData } from "@/lib/sagas/build-library-saga-cards";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";

// Posiciones del mini-abanico (hasta 3 portadas), mismo patrón centrado que
// `CollectionCard` (abanico de colecciones): la primera va centrada y
// encima, las otras dos se abren a los lados detrás — solo que aquí escalado
// al tamaño reducido de esta card (72×76 en vez del abanico a ancho completo).
const MINI_FAN_SLOTS = [
  { x: "-translate-x-1/2", rotate: "" },
  { x: "translate-x-[calc(-50%-13px)]", rotate: "-rotate-[14deg]" },
  { x: "translate-x-[calc(-50%+13px)]", rotate: "rotate-[14deg]" },
];
const MINI_FAN_Z = ["z-30", "z-20", "z-10"];

// Card de saga seguida (frame COL): mini-abanico, nombre, meta, tag «◆ Grafo»,
// barra segmentada y bloque «siguiente». La card entera NO es un enlace: el
// nombre enlaza a la ficha de saga y el bloque siguiente a la ficha de la obra.
export async function SagaLibraryCard({ card }: { card: LibrarySagaCardData }) {
  const t = await getTranslations("sagaLibrary");
  const pctLabel = `${card.progress.completed} / ${card.progress.total} · ${card.progress.pct}%`;
  const covers = card.covers.slice(0, 3);
  const dotClass = card.dominantType
    ? MEDIA_ACCENT[card.dominantType].bg
    : "bg-muted-foreground";

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        {/* Las portadas del abanico son decorativas (alt=""): sin este
            aria-label el enlace queda sin nombre accesible. */}
        <Link
          href={sagaHref(card.sagaId)}
          aria-label={card.name}
          className="relative h-[76px] w-[72px] shrink-0"
        >
          {covers.length === 0 && (
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[60px] w-[40px] -translate-x-1/2 -translate-y-1/2 rounded-[5px] border border-dashed border-border bg-surface-muted"
            />
          )}
          {covers.map((cover, index) => {
            const slot = MINI_FAN_SLOTS[index];
            return (
              <div
                key={`${cover}-${index}`}
                className={`absolute left-1/2 top-1/2 h-[60px] w-[40px] -translate-y-1/2 overflow-hidden rounded-[5px] border border-border bg-surface-muted shadow-cover ${slot.x} ${slot.rotate} ${MINI_FAN_Z[index]}`}
              >
                <Image src={cover} alt="" fill sizes="40px" className="object-cover" />
              </div>
            );
          })}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Link href={sagaHref(card.sagaId)} className="min-w-0 truncate font-serif text-[15.5px] font-semibold hover:underline">
              {card.name}
            </Link>
            {card.hasGraph && (
              <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-gold uppercase">
                ◆ {t("graphTag")}
              </span>
            )}
          </div>
          {card.creator && (
            <span className="truncate text-xs text-muted-foreground">{t("by", { name: card.creator })}</span>
          )}
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            {pctLabel}
            {card.childrenCount > 0 && ` · ${t("subsagas", { count: card.childrenCount })}`}
          </span>
        </div>
      </div>

      {/* Barra segmentada: universos por subsaga; sagas simples, un tramo del
          acento base. */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        {card.progress.segments.length > 0 ? (
          card.progress.segments.map((seg, i) => (
            <span
              key={i}
              className={`h-full ${SAGA_ACCENT[seg.accent].bg}`}
              style={{ width: `${seg.fraction * 100}%` }}
            />
          ))
        ) : (
          <span className="h-full bg-accent" style={{ width: `${card.progress.pct}%` }} />
        )}
      </div>

      <NextBlockView card={card} />
    </article>
  );
}

async function NextBlockView({ card }: { card: LibrarySagaCardData }) {
  const t = await getTranslations("sagaLibrary");
  const next = card.next;
  if (next.kind === "empty") return null;
  if (next.kind === "completed") {
    return (
      <p className="text-xs font-semibold text-muted-foreground">
        ✓ {t("completed")}
        {next.rating !== null && ` · ${t("ratedAt", { rating: next.rating })}`}
      </p>
    );
  }
  return (
    <Link
      href={itemHref(next.itemType, next.itemId)}
      className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 hover:bg-surface-muted"
    >
      {next.coverUrl ? (
        <span className="relative h-9 w-6 shrink-0 overflow-hidden rounded-sm">
          <Image src={next.coverUrl} alt="" fill sizes="24px" className="object-cover" />
        </span>
      ) : (
        <span aria-hidden className="h-9 w-6 shrink-0 rounded-sm border border-dashed border-border" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase">
          {next.kind === "reading" ? t("readingNow") : t("nextUp")}
        </span>
        <span className="truncate text-sm font-semibold">{next.title}</span>
      </span>
    </Link>
  );
}
