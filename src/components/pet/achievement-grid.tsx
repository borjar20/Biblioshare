"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { FamilyView } from "@/lib/pet/get-pet-snapshot";
import { AchievementBadge } from "./achievement-badge";

/** Nivel más alto primero; empate, por cercanía al siguiente; completas al final. */
export function sortFamilies(list: FamilyView[]): FamilyView[] {
  return [...list].sort((a, b) => {
    const aDone = a.nextThreshold == null, bDone = b.nextThreshold == null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.tier !== b.tier) return b.tier - a.tier;
    const ar = a.nextThreshold ? a.value / a.nextThreshold : 0;
    const br = b.nextThreshold ? b.value / b.nextThreshold : 0;
    return br - ar;
  });
}

/** Muro de insignias.
 *
 * Antes esto era una tabla: doce filas de dos insignias, la conseguida y la
 * siguiente, con doscientos píxeles vacíos entre ambas. Una colección se mira
 * como colección — una insignia por familia, la que tienes o el hueco de la que
 * viene— y el detalle (nivel, umbral, fecha) va debajo en texto pequeño. */
export function AchievementGrid({ achievements }: { achievements: FamilyView[] }) {
  const t = useTranslations("pet");
  const format = useFormatter();
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5" data-testid="achievement-grid" data-variant="game">
      <h3 className="text-lg font-semibold text-foreground">{t("achievements.title")}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sortFamilies(achievements).map((f) => {
          const name = t(`achievements.${f.family}`);
          const next = f.nextThreshold;
          const pct = next ? Math.max(0, Math.min(100, Math.round((f.value / next) * 100))) : 100;
          const earned = f.tier > 0;
          return (
            <li
              key={f.family}
              className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface-muted p-3 text-center"
              data-testid={`achievement-${f.family}`}
              data-tier={f.tier}
            >
              <AchievementBadge
                family={f.family}
                tier={earned ? f.tier : f.tier + 1}
                state={earned ? "earned" : "next"}
                size={72}
                label={earned ? t("achievements.badge", { family: name, tier: f.tier }) : t("achievements.badgeNext", { family: name, tier: f.tier + 1 })}
              />
              <span className="text-sm font-semibold text-foreground">{name}</span>
              <span className={`text-[13px] ${earned ? "text-accent" : "text-muted-foreground"}`}>
                {earned ? t("achievements.tier", { tier: f.tier }) : t("achievements.none")}
              </span>
              {next ? (
                <div className="flex w-full flex-col gap-1">
                  <span className="text-[13px] text-muted-foreground">
                    {t("achievements.next")} · {t("achievements.threshold", { value: Math.min(f.value, next), threshold: next })}
                  </span>
                  {/* Pista con borde y superficie propia: la anterior daba 1,05:1
                      sobre la tarjeta y la barra no se veía en ninguna captura. */}
                  <div
                    className="h-2 w-full overflow-hidden rounded-chip border border-border bg-surface-3"
                    role="progressbar"
                    aria-label={`${name} ${t("achievements.next")}`}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full bg-green" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ) : (
                <span className="text-[13px] text-accent">{t("achievements.complete")}</span>
              )}
              {earned && f.unlockedAt ? (
                <span className="text-[13px] text-muted-foreground">
                  {format.dateTime(new Date(f.unlockedAt), { day: "numeric", month: "short", year: "numeric" })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
