"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { formatDuration } from "@/lib/pace/format-duration";
import { TYPE_COVER, type SorteoItem } from "./sorteo-logic";
import type { Phase } from "./use-sorteo-game";
import styles from "./sorteo-stage.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Cover({ item, sizes }: { item: SorteoItem; sizes: string }) {
  const [c1, c2] = TYPE_COVER[item.itemType];
  return item.coverUrl ? (
    <Image src={item.coverUrl} alt="" fill sizes={sizes} className="object-cover" />
  ) : (
    <div className="absolute inset-0 grid content-between p-[10%]" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
      <span className="font-serif text-[13px] leading-tight font-semibold text-white/95">{item.title}</span>
      <span className="font-mono text-[9px] tracking-wider text-white/70 uppercase">{item.subtitle}</span>
    </div>
  );
}

// Candidatos delante del mueble (spec «La partida», fases 4–7).
export function StagePodium({
  phase, candidates, presented, focusIndex, duelPick, winner, onDiscard, onPick,
}: {
  phase: Phase;
  candidates: SorteoItem[];
  presented: number;
  focusIndex: number | null;
  duelPick: number | null;
  winner: SorteoItem | null;
  onDiscard: (index: number) => void;
  onPick: (index: number) => void;
}) {
  const t = useTranslations("sorteo");
  const reveal = phase === "reveal" || phase === "starting" || phase === "started";
  const duel = phase === "duel" || phase === "duelLuck" || phase === "duelPicked";
  const shown = reveal && winner ? [winner] : candidates;
  const estimate = (i: SorteoItem) =>
    i.estimatedMinutes !== null ? t("estimate", { duration: formatDuration(i.estimatedMinutes) }) : t("noEstimate");

  const card = (item: SorteoItem, index: number) => (
    <div
      key={`${item.itemType}:${item.itemId}`}
      className={cx(styles.cand, phase === "present" && styles.drop, !reveal && index >= presented && phase === "present" && styles.hidden,
        focusIndex === index && styles.focus, focusIndex !== null && focusIndex !== index && styles.dim,
        duelPick === index && styles.pick, reveal && styles.win)}
      style={{ "--c1": TYPE_COVER[item.itemType][0], "--c2": TYPE_COVER[item.itemType][1], animationDelay: phase === "present" ? `${index * 120}ms` : undefined } as React.CSSProperties}
      onClick={phase === "duel" ? () => onPick(index) : undefined}
      role={phase === "duel" ? "button" : undefined}
      tabIndex={phase === "duel" ? 0 : undefined}
      aria-pressed={phase === "duel" ? duelPick === index : undefined}
      aria-label={phase === "duel" ? item.title : undefined}
      onKeyDown={phase === "duel" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(index); } } : undefined}
    >
      {phase === "discard" && (
        <button type="button" className={styles.x} aria-label={t("discardLabel", { title: item.title })}
          onClick={(e) => { e.stopPropagation(); onDiscard(index); }}>✕</button>
      )}
      <div className={styles.flip}>
        <div className={styles.face}><Cover item={item} sizes="150px" /></div>
        <div className={styles.back} />
      </div>
      <div className={styles.ped} />
      {/* La etiqueta ocupa siempre su sitio (oculta hasta que se presenta) y
          tiene alto fijo: si apareciera o cambiara de alto, las cartas, alineadas
          por abajo, darían un salto al presentarse cada una. */}
      {!reveal && (
        <div className={styles.tag} aria-hidden={phase === "present" && index >= presented}
          style={phase === "present" && index >= presented ? { visibility: "hidden" } : undefined}>
          <b>{item.title}</b>{estimate(item)}
        </div>
      )}
    </div>
  );

  return (
    <div className={cx(styles.podium, phase === "discard" && styles.discarding, duel && styles.duel, reveal && styles.reveal)}>
      {duel && shown.length === 2
        ? [card(shown[0], 0), <div key="vs" className={styles.vs} aria-hidden>vs</div>, card(shown[1], 1)]
        : shown.map(card)}
    </div>
  );
}
