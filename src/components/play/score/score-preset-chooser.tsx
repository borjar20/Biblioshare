"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import type { Participant } from "@/lib/play/core/types";
import type { ScoreSetup, ScoreTarget } from "@/lib/play/score/types";
import { buttonVariants } from "@/components/ui/button";

export type ScorePresetId = "libre" | "rondas" | "puntos";

export const SCORE_PRESET_IDS: ScorePresetId[] = ["libre", "rondas", "puntos"];

/**
 * Prefill SOLO (spec §5): el preset rellena, `score-setup-form.tsx` deja
 * cambiarlo. Un único sitio para los dos números — si viven duplicados en
 * cada pantalla, acaban desincronizados en la primera edición.
 */
export const SCORE_PRESET_PREFILL: Record<Exclude<ScorePresetId, "libre">, number> = {
  rondas: 10,
  puntos: 100,
};

const PLAY_NOW_PLAYERS = 4;

export function parseScorePreset(value: string | null): ScorePresetId {
  return SCORE_PRESET_IDS.includes(value as ScorePresetId) ? (value as ScorePresetId) : "libre";
}

/** Target del preset elegido, o `undefined` para «Libre» (sin límite). */
export function scoreTargetForPreset(preset: ScorePresetId): ScoreTarget | undefined {
  if (preset === "libre") return undefined;
  return { kind: preset === "rondas" ? "rounds" : "points", value: SCORE_PRESET_PREFILL[preset] };
}

/** Reserva la altura exacta del selector: sin esto el hub salta al hidratar. */
export function ScorePresetChooserSkeleton() {
  return <div aria-hidden className="h-[280px]" />;
}

/**
 * Selector de preset + arranque. Espejo estructural de `mtg-mode-chooser.tsx`
 * (mismo patrón de arranque: guard de loading, discard si hay activa, start,
 * push a `/partida/activa`), con dos diferencias que vienen del dominio:
 *
 * - No hay «cuántos sois» aquí: puntuación no tiene un mínimo/máximo por
 *   modo como mtg — «Jugar ya» siempre usa 4, y quien quiera otro número
 *   pasa por «Configurar» (spec §5: el preset SOLO prefija).
 * - El número de la tarjeta es el PREFILL (10 rondas, 100 puntos), no una
 *   regla del motor: rondas y puntos se pueden cambiar en la configuración,
 *   y «Libre» no tiene límite que enseñar (∞).
 */
export function ScorePresetChooser({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preset, setPreset] = useState<ScorePresetId>(() => parseScorePreset(searchParams.get("preset")));
  const { snapshot, store } = useActiveGame(identity);

  function playNow() {
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    const participants: Participant[] = Array.from({ length: PLAY_NOW_PLAYERS }, (_, i) => ({
      id: `p${i + 1}`,
      kind: "guest",
      name: t("setup.playerN", { n: i + 1 }),
    }));
    const setup: ScoreSetup = {
      participants,
      direction: "highest",
      target: scoreTargetForPreset(preset),
    };
    // Mismo contrato que «Empezar» en la configuración: arrancar ES pedir
    // sustituir la partida que hubiera (spec §4, una sola activa).
    if (snapshot.game) store.discard();
    if (!store.start(makeEvent("game_started", { toolId: "score" as const, setup }, Date.now()))) {
      return;
    }
    router.push("/partida/activa");
  }

  return (
    <>
      <section>
        <h2 className="mb-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("tools.score.presetsTitle")}
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {SCORE_PRESET_IDS.map((id) => {
            const selected = id === preset;
            const prefill = id === "libre" ? null : SCORE_PRESET_PREFILL[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPreset(id)}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-1 rounded-card border p-4 text-center transition-colors ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <span className="font-serif text-[34px] font-semibold leading-none">
                  {prefill ?? "∞"}
                </span>
                <span className="mt-1 font-serif text-[15px] font-semibold">
                  {t(`tools.score.presets.${id}.name`)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t(`tools.score.presets.${id}.detail`)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={playNow}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("tools.score.playNow")}
        </button>
        <Link
          href={`/partidas/puntuacion/nueva?preset=${preset}`}
          className={buttonVariants("secondary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("tools.score.configure")}
        </Link>
      </div>
    </>
  );
}
