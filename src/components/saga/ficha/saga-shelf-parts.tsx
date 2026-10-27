import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";
import type { ShelfGroup, ShelfSlot, ShelfWork } from "@/lib/sagas/derive-shelf";

// Piezas presentacionales de la balda (spec 2026-10-27 §2). Sin estado propio.

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
      <span className="relative block h-[62px] w-[58px]">
        {covers.map((src, i) => (
          <span
            key={i}
            style={{ left: i * 7, bottom: i * 3 }}
            className={`absolute block h-[54px] w-[36px] overflow-hidden rounded-[3px] shadow-cover ${group.state === "done" ? "outline-2 outline-green" : ""} ${src ? "" : SAGA_ACCENT[group.accent].bg}`}
          >
            {src && <Image src={src} alt="" fill sizes="36px" className="object-cover" />}
          </span>
        ))}
      </span>
      <span className="max-w-[90px] truncate font-mono text-[10px] text-muted-foreground">
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
      ? "h-[96px] w-[64px] sm:h-[120px] sm:w-[80px]"
      : small
        ? "h-[48px] w-[32px]"
        : "h-[66px] w-[44px] sm:h-[84px] sm:w-[56px]";
  const state =
    work.state === "now" ? "outline-[3px] outline-accent" : work.state === "done" ? "outline-2 outline-green" : "opacity-55";
  // Tándem y ventana mandan sobre el contorno de estado; «ahora» y «leída»
  // siguen distinguiéndose por la etiqueta y el ✓, que no dependen del contorno.
  return (
    <Link
      href={work.href}
      data-shelf-link
      data-testid={work.state === "now" ? "shelf-now" : undefined}
      title={work.title}
      className={`relative block shrink-0 overflow-hidden rounded-[4px] shadow-cover outline-offset-1 ${size} ${ring ?? state} ${work.state === "todo" && ring ? "opacity-55" : ""} ${work.skipped ? "grayscale" : ""}`}
    >
      {work.coverUrl ? (
        <Image src={work.coverUrl} alt={work.title} fill sizes="80px" className="object-cover" />
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
  );
}
