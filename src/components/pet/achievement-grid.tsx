"use client";

import { useTranslations } from "next-intl";
import type { FamilyView } from "@/lib/pet/get-pet-snapshot";

export function AchievementGrid({ achievements }: { achievements: FamilyView[] }) {
  const t = useTranslations("pet");
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="achievement-grid">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("achievements.title")}</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {achievements.map((a) => (
          <li key={a.family} data-testid={`achievement-${a.family}`} data-tier={a.tier}>
            {t(`achievements.${a.family}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
