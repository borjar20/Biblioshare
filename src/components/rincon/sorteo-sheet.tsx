"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { updateStatus } from "@/lib/library/manage-actions";
import {
  DEFAULT_FILTERS,
  eligibleItems,
  pickIndex,
  sampleShelf,
  spineHeight,
  SPINE_COLORS,
  TYPE_ACCENT,
  type SorteoCollection,
  type SorteoFilters,
  type SorteoItem,
} from "./sorteo-logic";

// La ceremonia es el producto (mockup «Sorteo · Sacar un lomo»): el ganador se
// decide ANTES de animar; la ruleta solo desacelera hasta él. Fases:
// shelf (estantería quieta) → spinning (tick recorriendo lomos) → revealed.
type Phase = "shelf" | "spinning" | "revealed";

const TYPE_FILTERS: { value: SorteoFilters["type"]; labelKey: string }[] = [
  { value: "all", labelKey: "sorteoFilterAll" },
  { value: "book", labelKey: "sorteoFilterBooks" },
  { value: "movie", labelKey: "sorteoFilterMovies" },
  { value: "series", labelKey: "sorteoFilterSeries" },
];

const DUR_FILTERS: { value: SorteoFilters["dur"]; labelKey: string }[] = [
  { value: "any", labelKey: "sorteoFilterDurAny" },
  { value: "short", labelKey: "sorteoFilterDurShort" },
  { value: "med", labelKey: "sorteoFilterDurMed" },
  { value: "long", labelKey: "sorteoFilterDurLong" },
  { value: "none", labelKey: "sorteoFilterDurNone" },
];

const STATE_FILTERS: { value: SorteoFilters["state"]; labelKey: string }[] = [
  { value: "any", labelKey: "sorteoFilterStateAny" },
  { value: "fresh", labelKey: "sorteoFilterStateFresh" },
];

const CTA_KEY: Record<ItemType, string> = {
  book: "sorteoCtaBook",
  movie: "sorteoCtaMovie",
  series: "sorteoCtaSeries",
};

export function SorteoSheet({
  pool,
  collections,
  open,
  onClose,
}: {
  pool: SorteoItem[];
  collections: SorteoCollection[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("rincon");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timers = useRef<number[]>([]);

  const [filters, setFilters] = useState<SorteoFilters>(DEFAULT_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [shelfSeed, setShelfSeed] = useState(0);
  const [phase, setPhase] = useState<Phase>("shelf");
  const [tickIndex, setTickIndex] = useState<number | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  // El ítem revelado se congela aquí: tras el CTA el server revalida y el pool
  // (y con él la estantería) cambia bajo los pies — un índice vivo señalaría
  // a otro título (bug cazado en el smoke del 2026-07-17).
  const [picked, setPicked] = useState<SorteoItem | null>(null);
  const [ctaState, setCtaState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(() => eligibleItems(pool, filters), [pool, filters]);
  // shelfSeed fuerza el rebarajado en cada apertura de la hoja.
  const shelf = useMemo(
    () => sampleShelf(eligible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligible, shelfSeed]
  );

  const resetToShelf = useCallback(() => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
    setPhase("shelf");
    setTickIndex(null);
    setWinner(null);
    setPicked(null);
    setCtaState("idle");
  }, []);

  // Mismo <dialog> nativo que new-pass-sheet.tsx: foco atrapado y Escape
  // gratis; "close" es la única vía de aviso al padre.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setShelfSeed((s) => s + 1);
      resetToShelf();
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, resetToShelf]);

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach((id) => clearTimeout(id));
  }, []);

  function setFilter(patch: Partial<SorteoFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    resetToShelf();
  }

  // forcedPos: tocar un lomo concreto lo saca directamente (mockup).
  function draw(forcedPos?: number) {
    if (shelf.length === 0 || phase === "spinning" || pending) return;
    const target = forcedPos ?? pickIndex(shelf.length);
    resetToShelf();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || shelf.length === 1) {
      setWinner(target);
      setPicked(shelf[target]);
      setPhase("revealed");
      return;
    }

    setPhase("spinning");
    const steps = shelf.length + target + 1;
    let step = 0;
    let delay = 40;
    const run = () => {
      setTickIndex(step % shelf.length);
      step += 1;
      if (step < steps) {
        delay = Math.min(delay * 1.16, 240);
        timers.current.push(window.setTimeout(run, delay));
      } else {
        // Pausa con el ganador elevado y el resto atenuado, luego revelado.
        setTickIndex(null);
        setWinner(target);
        setPicked(shelf[target]);
        timers.current.push(window.setTimeout(() => setPhase("revealed"), 520));
      }
    };
    run();
  }

  function start() {
    if (!picked || pending || ctaState === "done") return;
    const target = picked;
    startTransition(async () => {
      try {
        const outcome = await updateStatus(target.itemType, target.itemId, "in_progress");
        setCtaState(outcome.kind === "done" ? "done" : "error");
      } catch {
        setCtaState("error");
      }
    });
  }

  // ✕: desde el resultado (o en plena ruleta) vuelve a la estantería
  // conservando filtros; desde la estantería cierra la hoja.
  function handleClose() {
    if (phase === "revealed" || phase === "spinning") resetToShelf();
    else onClose();
  }

  const customActive =
    filters.dur !== "any" || filters.state !== "any" || filters.collection !== "all";
  const revealed = phase === "revealed" && picked !== null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-black/60 sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:w-[540px] sm:rounded-[20px]"
      style={{ background: "#1f1a16", color: "#f0e8db", border: "1px solid rgba(240,232,219,.12)" }}
      aria-label={t("sorteoTitle")}
    >
      <div className="flex h-full flex-col overflow-y-auto p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">{t("sorteoTitle")}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("sorteoClose")}
            className="grid h-9 w-9 place-items-center rounded-lg border text-sm"
            style={{ background: "#2a231d", borderColor: "rgba(240,232,219,.12)" }}
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-xs" style={{ color: "#a99e8c" }}>
          {revealed
            ? t("sorteoDrawn")
            : shelf.length === 0
              ? t("sorteoNoMatch")
              : t("sorteoCount", { count: eligible.length })}
        </p>

        {!revealed && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter({ type: f.value })}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={
                    filters.type === f.value
                      ? { background: "#d98a5c", borderColor: "#d98a5c", color: "#1f1409" }
                      : { background: "#2a231d", borderColor: "rgba(240,232,219,.12)", color: "#a99e8c" }
                  }
                >
                  {f.value !== "all" && (
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: TYPE_ACCENT[f.value] }}
                    />
                  )}
                  {t(f.labelKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={
                  customActive
                    ? { background: "#d98a5c", borderColor: "#d98a5c", color: "#1f1409" }
                    : { background: "#2a231d", borderColor: "rgba(240,232,219,.12)", color: "#a99e8c" }
                }
              >
                ⚙ {t("sorteoFilterCustom")}
              </button>
            </div>

            {panelOpen && (
              <div
                className="mt-3 rounded-[14px] border p-4"
                style={{ background: "#2a231d", borderColor: "rgba(240,232,219,.12)" }}
              >
                <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#a99e8c" }}>
                  {t("sorteoFilterDurationLabel")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DUR_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter({ dur: f.value })}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                      style={
                        filters.dur === f.value
                          ? { background: "#332b23", borderColor: "#d98a5c", color: "#d98a5c" }
                          : { background: "#332b23", borderColor: "transparent", color: "#f0e8db" }
                      }
                    >
                      {t(f.labelKey)}
                    </button>
                  ))}
                </div>
                <p className="mt-4 font-mono text-[10px] tracking-widest uppercase" style={{ color: "#a99e8c" }}>
                  {t("sorteoFilterStateLabel")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STATE_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter({ state: f.value })}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                      style={
                        filters.state === f.value
                          ? { background: "#332b23", borderColor: "#d98a5c", color: "#d98a5c" }
                          : { background: "#332b23", borderColor: "transparent", color: "#f0e8db" }
                      }
                    >
                      {t(f.labelKey)}
                    </button>
                  ))}
                </div>

                {/* Solo si el usuario ha marcado alguna colección como
                    sorteable: sin marcadas, este grupo no aparece y el sorteo
                    se comporta como antes (toda la biblioteca). */}
                {collections.length > 0 && (
                  <>
                    <p
                      className="mt-4 font-mono text-[10px] tracking-widest uppercase"
                      style={{ color: "#a99e8c" }}
                    >
                      {t("sorteoFilterCollectionLabel")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { value: "all", label: t("sorteoFilterCollectionAll") },
                        ...collections.map((c) => ({ value: c.id, label: c.name })),
                      ].map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setFilter({ collection: f.value })}
                          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                          style={
                            filters.collection === f.value
                              ? { background: "#332b23", borderColor: "#d98a5c", color: "#d98a5c" }
                              : { background: "#332b23", borderColor: "transparent", color: "#f0e8db" }
                          }
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="mt-6 flex h-[210px] items-end justify-center gap-1.5">
              {shelf.map((item, i) => {
                const isTick = tickIndex === i;
                const isChosen = winner === i;
                const isDim = winner !== null && winner !== i;
                const colors = SPINE_COLORS[item.itemType];
                return (
                  <button
                    key={`${item.itemType}:${item.itemId}`}
                    type="button"
                    onClick={() => draw(i)}
                    title={item.title}
                    className="relative w-[34px] rounded-t-md rounded-b-sm transition-all duration-300"
                    style={{
                      height: `${spineHeight(item.itemId)}%`,
                      background: `linear-gradient(90deg, ${colors.from}, ${colors.to} 45%, ${colors.from})`,
                      transform: isChosen
                        ? "translateY(-34px)"
                        : isTick
                          ? "translateY(-12px)"
                          : "none",
                      opacity: isDim ? 0.35 : 1,
                      boxShadow: isChosen
                        ? "0 0 0 2px #e0a94a, 0 18px 30px -10px rgba(224,169,74,.35)"
                        : "0 6px 14px -6px rgba(0,0,0,.6)",
                    }}
                  >
                    <span
                      className="absolute inset-0 grid place-items-center overflow-hidden py-2 font-serif text-[11px]"
                      style={{ writingMode: "vertical-rl", color: "rgba(255,248,238,.85)" }}
                    >
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="mt-0.5 h-2.5 rounded-[3px]"
              style={{
                background: "linear-gradient(180deg, #4a3c2d, #2e251b)",
                boxShadow: "0 10px 24px -10px rgba(0,0,0,.7)",
              }}
            />
            <button
              type="button"
              onClick={() => draw()}
              disabled={shelf.length === 0 || phase === "spinning"}
              className="mt-6 w-full rounded-[13px] py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "#d98a5c", color: "#1f1409" }}
            >
              {t("sorteoDraw")}
            </button>
          </>
        )}

        {revealed && picked && (
          <div className="mt-6 flex flex-1 flex-col items-center text-center">
            <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#e0a94a" }}>
              {t("sorteoResultLabel")}
            </p>
            <div
              className="sorteo-flip-in relative mt-3 aspect-[2/3] w-[118px] overflow-hidden rounded-lg"
              style={{ boxShadow: `0 22px 40px -14px rgba(0,0,0,.7), 0 0 0 1.5px ${TYPE_ACCENT[picked.itemType]}` }}
            >
              {picked.coverUrl ? (
                <Image src={picked.coverUrl} alt={picked.title} fill sizes="118px" className="object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: SPINE_COLORS[picked.itemType].to }} />
              )}
            </div>
            <h3 className="mt-4 font-serif text-xl leading-tight font-semibold">{picked.title}</h3>
            <p className="mt-1.5 text-sm" style={{ color: "#a99e8c" }}>
              {picked.subtitle ? `${picked.subtitle} · ${picked.metaText}` : picked.metaText}
            </p>
            {picked.estimateText && (
              // formulaText ya trae el "≈" dentro — no anteponer otro.
              <p className="mt-2 text-xs font-medium" style={{ color: "#e0a94a" }}>
                {picked.estimateText}
              </p>
            )}

            <div className="mt-6 w-full">
              {ctaState === "error" && (
                <p className="mb-2 text-xs" style={{ color: "#d97a63" }}>
                  {t("sorteoCtaError")}
                </p>
              )}
              <button
                type="button"
                onClick={start}
                disabled={pending || ctaState === "done"}
                className="w-full rounded-[13px] py-3.5 text-sm font-semibold disabled:opacity-70"
                style={{ background: "#d98a5c", color: "#1f1409" }}
              >
                {ctaState === "done" ? t("sorteoCtaDone") : t(CTA_KEY[picked.itemType])}
              </button>
              {ctaState === "done" ? (
                <Link
                  href={itemHref(picked.itemType, picked.itemId)}
                  className="mt-2.5 block w-full rounded-[13px] border py-3.5 text-sm font-semibold"
                  style={{ borderColor: "rgba(240,232,219,.12)", color: "#f0e8db" }}
                >
                  {t("sorteoGoToItem")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    resetToShelf();
                    // Deja que la estantería vuelva a montarse antes de girar.
                    timers.current.push(window.setTimeout(() => draw(), 150));
                  }}
                  disabled={pending}
                  className="mt-2.5 w-full rounded-[13px] border py-3.5 text-sm font-semibold"
                  style={{ borderColor: "rgba(240,232,219,.12)", color: "#f0e8db" }}
                >
                  {t("sorteoAgain")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
