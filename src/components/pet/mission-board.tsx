"use client";

import { useTranslations } from "next-intl";
import { MISSION_ATTR } from "@/lib/pet/missions/templates";
import type { MissionView } from "@/lib/pet/missions/sync";

export function MissionBoard({ missions }: { missions: MissionView[] }) {
  const t = useTranslations("pet");
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="mission-board">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("missions.title")}</h3>
      {missions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("missions.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((m) => {
            const pct = Math.max(0, Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100)));
            // El mismo texto en la etiqueta y en la barra: un progressbar sin
            // nombre accesible se anuncia como «57 %» de nada.
            const label = t(`missions.${m.template}`, { target: m.target, title: m.title ?? "" });
            return (
              <li
                key={m.slot}
                className="flex flex-col gap-1"
                data-testid={`mission-${m.template}`}
                data-completed={m.completed ? "true" : "false"}
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={m.completed ? "line-through text-muted-foreground" : "font-medium text-foreground"}>
                    <span className="mr-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {t(`attributes.${MISSION_ATTR[m.template]}`)}
                    </span>
                    {label}
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground">
                    {m.completed ? `✓ ${t("missions.done")}` : t("missions.xp", { xp: m.xp })}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={m.completed ? "h-full bg-accent" : "h-full bg-muted-foreground"} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[12px] text-muted-foreground">{t("missions.progress", { progress: m.progress, target: m.target })}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
