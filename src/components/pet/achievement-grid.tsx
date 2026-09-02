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

export function AchievementGrid({ achievements }: { achievements: FamilyView[] }) {
  const t = useTranslations("pet");
  const format = useFormatter();
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="achievement-grid">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("achievements.title")}</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sortFamilies(achievements).map((f) => {
          const name = t(`achievements.${f.family}`);
          const next = f.nextThreshold;
          const pct = next ? Math.max(0, Math.min(100, Math.round((f.value / next) * 100))) : 100;
          return (
            <li
              key={f.family}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
              data-testid={`achievement-${f.family}`}
              data-tier={f.tier}
            >
              <span className="text-sm font-medium text-foreground">{name}</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <AchievementBadge family={f.family} tier={f.tier} state={f.tier > 0 ? "earned" : "next"} label={f.tier > 0 ? t("achievements.badge", { family: name, tier: f.tier }) : t("achievements.none")} />
                  <div className="flex flex-col text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">{t("achievements.earned")}</span>
                    {f.tier > 0 ? (
                      <>
                        <span>{t("achievements.tier", { tier: f.tier })} · {f.threshold}</span>
                        {f.unlockedAt ? <span>{format.dateTime(new Date(f.unlockedAt), { day: "numeric", month: "short", year: "numeric" })}</span> : null}
                      </>
                    ) : (
                      <span>{t("achievements.none")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {next ? (
                    <>
                      <AchievementBadge family={f.family} tier={f.tier + 1} state="next" label={t("achievements.badgeNext", { family: name, tier: f.tier + 1 })} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground">{t("achievements.next")}</span>
                        <span>{t("achievements.tier", { tier: f.tier + 1 })} · {t("achievements.threshold", { value: Math.min(f.value, next), threshold: next })}</span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`${name} ${t("achievements.next")}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full bg-muted-foreground" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">{t("achievements.complete")}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
