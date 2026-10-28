"use client";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AtlasWork } from "@/lib/sagas/atlas/model";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";

export type WorkFacts = {
  state: string; // «leída», «ahora», «pendiente» o «saltada»
  role: { glyph: string; label: string } | null;
  window: string | null; // «Encaja entre A y B · motivo»
  fitsNow: string | null; // «Ahora encaja» (notice = dentro)
  tandem: string | null; // «A la vez que C» o «En cualquier orden con C»
  tandemNote: string | null;
  step: string | null; // «Paso 2 del itinerario»
  stepNote: string | null;
};

const STATE_KEY = { done: "atlas.done", now: "atlas.now", todo: "atlas.todo" } as const;

/** Lo que la mini-ficha y la lista cuentan de una obra, ya en texto (spec 2026-10-28 §7–8).
 *  `works` hace falta para nombrar a las compañeras de tándem. */
export function useWorkFacts(works: readonly AtlasWork[]) {
  const t = useTranslations("saga");
  return useCallback(
    (work: AtlasWork): WorkFacts => {
      const w = work.window;
      let window: string | null = null;
      if (w) {
        const span = w.afterTitle && w.beforeTitle
          ? t("atlas.windowBetween", { after: w.afterTitle, before: w.beforeTitle })
          : w.afterTitle ? t("atlas.windowAfter", { title: w.afterTitle })
          : w.beforeTitle ? t("atlas.windowBefore", { title: w.beforeTitle })
          : null;
        const reason = w.reason === "spoiler" ? t("timelineWindowReasonSpoiler")
          : w.reason === "contexto" ? t("timelineWindowReasonContexto")
          : null;
        window = [span, reason].filter(Boolean).join(" · ") || null;
      }
      const tw = work.tandem;
      let tandem: string | null = null;
      if (tw) {
        const titles = tw.partnerKeys.map((k) => works.find((o) => o.key === k)?.title).filter(Boolean).join(", ");
        if (titles) {
          tandem = tw.mode === "simultaneo" ? t("atlas.tandemSimultaneo", { titles })
            : tw.mode === "indistinto" ? t("atlas.tandemIndistinto", { titles })
            : t("atlas.tandemSinModo", { titles });
        }
      }
      return {
        state: work.skipped ? t("atlas.skipped") : t(STATE_KEY[work.state]),
        role: work.role ? { glyph: ROLE_GLYPH[work.role], label: t(`roleLabel.${work.role}`) } : null,
        window,
        fitsNow: w?.notice === "dentro" ? t("atlas.windowFitsNow") : null,
        tandem,
        tandemNote: tw?.note ?? null,
        step: work.step !== null ? t("atlas.step", { n: work.step }) : null,
        stepNote: work.stepNote,
      };
    },
    [t, works],
  );
}
