"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { AchievementView } from "@/lib/pet/get-pet-snapshot";

export function AchievementGrid({ achievements }: { achievements: AchievementView[] }) {
  const t = useTranslations("pet");
  const format = useFormatter();
  // Desbloqueados primero por fecha; luego bloqueados por cercanía al umbral.
  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked && b.unlocked) return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
    return b.value / b.threshold - a.value / a.threshold;
  });
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="achievement-grid">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("achievements.title")}</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sorted.map((a) => (
          <li
            key={a.id}
            className={
              a.unlocked
                ? "flex flex-col gap-0.5 rounded-lg border border-accent bg-surface p-3"
                : "flex flex-col gap-0.5 rounded-lg border border-border bg-surface-muted p-3 text-muted-foreground"
            }
            data-testid={`achievement-${a.id}`}
            data-unlocked={a.unlocked ? "true" : "false"}
          >
            <span className="text-sm font-medium">{t(`achievements.${a.id}`)}</span>
            <span className="text-[12px]">
              {a.unlocked && a.unlockedAt
                ? t("achievements.unlockedOn", { date: format.dateTime(new Date(a.unlockedAt), { day: "numeric", month: "short", year: "numeric" }) })
                : t("achievements.locked", { value: Math.min(a.value, a.threshold), threshold: a.threshold })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
