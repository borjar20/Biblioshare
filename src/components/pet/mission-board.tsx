"use client";

import { useTranslations } from "next-intl";
import { MISSION_ATTR } from "@/lib/pet/missions/templates";
import type { MissionView } from "@/lib/pet/missions/sync";
import { CheckIcon } from "@/components/ui/icons";
import { ATTR_COLOR, ATTR_ICON } from "./attribute-art";

export function MissionBoard({ missions }: { missions: MissionView[] }) {
  const t = useTranslations("pet");
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5" data-testid="mission-board" data-variant="game">
      <h3 className="text-lg font-semibold text-foreground">{t("missions.title")}</h3>
      {missions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("missions.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((m) => {
            const pct = Math.max(0, Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100)));
            // El mismo texto en la etiqueta y en la barra: un progressbar sin
            // nombre accesible se anuncia como «57 %» de nada.
            const label = t(`missions.${m.template}`, { target: m.target, title: m.title ?? "" });
            const attr = MISSION_ATTR[m.template];
            const Icon = ATTR_ICON[attr];
            return (
              <li
                key={m.slot}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface-muted p-3"
                data-testid={`mission-${m.template}`}
                data-completed={m.completed ? "true" : "false"}
              >
                <div className="flex items-start gap-2.5 text-sm">
                  {/* El icono del atributo sustituye al chip de texto: el mismo
                      glifo aparece en Personaje, así que la misión dice a qué
                      alimenta sin obligar a recordar un mapa de nombres. */}
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-[18px] shrink-0"
                    style={{ color: ATTR_COLOR[attr] }}
                  />
                  <span className="sr-only">{t(`attributes.${attr}`)}</span>
                  <span className={`min-w-0 flex-1 ${m.completed ? "text-muted-foreground line-through" : "font-medium text-foreground"}`}>
                    {label}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[13px] tabular-nums text-muted-foreground">
                    {m.completed
                      ? <><CheckIcon aria-hidden="true" className="size-4 text-green" />{t("missions.done")}</>
                      : t("missions.xp", { xp: m.xp })}
                  </span>
                </div>
                {/* La pista lleva borde y un escalón de superficie por encima del
                    fondo de la tarjeta: con `bg-surface-muted` sobre la tarjeta
                    daba 1,05:1 y la barra sencillamente no se veía. */}
                <div
                  className="h-2 w-full overflow-hidden rounded-chip border border-border bg-surface-3"
                  role="progressbar"
                  aria-label={label}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className={`h-full ${m.completed ? "bg-accent" : "bg-green"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[13px] text-muted-foreground">{t("missions.progress", { progress: m.progress, target: m.target })}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
