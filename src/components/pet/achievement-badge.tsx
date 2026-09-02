import type { AchievementFamily } from "@/lib/pet/achievements";
import { BADGE_MANIFEST, BADGE_SIZE } from "@/lib/pet/badges";
import styles from "./achievement-badge.module.css";

const RANKS = ["bronze", "silver", "gold", "legend"] as const;

export type BadgeState = "earned" | "next";

/** Rango visual del marco por nivel: 1 bronce, 2 plata, 3 oro, 4 leyenda, 5 bronce… */
export function rankFor(tier: number): (typeof RANKS)[number] | null {
  return tier >= 1 ? RANKS[(tier - 1) % RANKS.length] : null;
}

export function AchievementBadge({
  family,
  tier,
  state,
  size = 48,
  label,
}: {
  family: AchievementFamily;
  tier: number;
  state: BadgeState;
  size?: number;
  label: string;
}) {
  const rank = rankFor(tier);
  const img = Math.max(BADGE_SIZE, size - 12);
  return (
    <span
      className={[styles.badge, rank ? styles[rank] : styles.none, state === "next" ? styles.next : ""].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      data-rank={rank ?? "none"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel art 32×32: next/image reescalaría con filtro bilineal */}
      <img src={BADGE_MANIFEST[family]} alt="" width={img} height={img} className={styles.img} />
      {tier >= 1 ? <span className={styles.tier} aria-hidden="true">{tier}</span> : null}
    </span>
  );
}
