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
 * Prefill SOLO (spec §5): el preset rellena, la configuración deja cambiarlo.
 * Un único sitio para los dos números — duplicados se desincronizan.
 */
export const SCORE_PRESET_PREFILL: Record<Exclude<ScorePresetId, "libre">, number> = {
  rondas: 10,
  puntos: 100,
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_PLAYERS = 4;

export function parseScorePreset(value: string | null): ScorePresetId {
  return SCORE_PRESET_IDS.includes(value as ScorePresetId) ? (value as ScorePresetId) : "libre";
}

/** Target del preset elegido con SU prefill, o `undefined` para «Libre». */
export function scoreTargetForPreset(preset: ScorePresetId): ScoreTarget | undefined {
  if (preset === "libre") return undefined;
  return { kind: preset === "rondas" ? "rounds" : "points", value: SCORE_PRESET_PREFILL[preset] };
}

/** Reserva la altura exacta del selector: sin esto el hub salta al hidratar. */
export function ScorePresetChooserSkeleton() {
  return <div aria-hidden className="h-[420px]" />;
}

const CHIP = (selected: boolean) =>
  `tap-44 h-11 min-w-11 flex-1 rounded-chip border font-mono text-[15px] tabular-nums transition-colors ${
    selected ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
  }`;

/**
 * Selector de preset + arranque. Espejo estructural de `mtg-mode-chooser.tsx`
 * (mismo patrón: guard de loading, discard si hay activa, start, push).
 *
 * Revisión sobre uso real (2026-08-31): el número N del límite y el número de
 * jugadores se preguntan AQUÍ, no solo en la configuración — «Jugar ya» con 4
 * fijos y 10/100 inmutables obligaba a pasar por «Configurar» para lo más
 * básico. La tarjeta seleccionada enseña el N vigente; «Configurar» arrastra
 * ambos números por query para que las dos pantallas no se contradigan.
 */
export function ScorePresetChooser({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preset, setPreset] = useState<ScorePresetId>(() => parseScorePreset(searchParams.get("preset")));
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  // Un valor por preset con límite: cambiar de tarjeta recupera el número que
  // ese preset tenía, no arrastra el del otro (10 rondas ≠ 100 puntos).
  const [targetValues, setTargetValues] = useState<Record<Exclude<ScorePresetId, "libre">, number>>({
    ...SCORE_PRESET_PREFILL,
  });
  const { snapshot, store } = useActiveGame(identity);

  const targetValue = preset === "libre" ? null : targetValues[preset];
  const targetValid = preset === "libre" || (Number.isInteger(targetValue) && (targetValue as number) >= 1);

  function playNow() {
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    // Guarda ANTES de descartar (issue #964): un límite que el reducer
    // rechazaría no debe costar la partida activa.
    if (!targetValid) return;
    const participants: Participant[] = Array.from({ length: players }, (_, i) => ({
      id: `p${i + 1}`,
      kind: "guest",
      name: t("setup.playerN", { n: i + 1 }),
    }));
    const setup: ScoreSetup = {
      participants,
      direction: "highest",
      target:
        preset === "libre"
          ? undefined
          : { kind: preset === "rondas" ? "rounds" : "points", value: targetValue as number },
    };
    // Mismo contrato que «Empezar» en la configuración: arrancar ES pedir
    // sustituir la partida que hubiera (spec §4, una sola activa).
    if (snapshot.game) store.discard();
    if (!store.start(makeEvent("game_started", { toolId: "score" as const, setup }, Date.now()))) {
      return;
    }
    router.push("/partida/activa");
  }

  const configureHref =
    `/partidas/puntuacion/nueva?preset=${preset}&jugadores=${players}` +
    (preset === "libre" ? "" : `&n=${targetValue}`);

  return (
    <>
      <section>
        <h2 className="mb-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("tools.score.presetsTitle")}
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {SCORE_PRESET_IDS.map((id) => {
            const selected = id === preset;
            // La tarjeta seleccionada enseña el N vigente (editable abajo);
            // las demás, su prefill — lo que saldrá si las tocas.
            const shown = id === "libre" ? null : selected ? targetValue : SCORE_PRESET_PREFILL[id];
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
                  {shown ?? "∞"}
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

        {/* El N del límite, editable sin pasar por la configuración. */}
        {preset !== "libre" && (
          <div className="mt-3 flex items-center gap-2">
            <label
              htmlFor="preset-target"
              className="shrink-0 text-[13px] font-semibold"
            >
              {t(preset === "rondas" ? "scoreSetup.targetRounds" : "scoreSetup.targetPoints")}
            </label>
            <input
              id="preset-target"
              type="number"
              inputMode="numeric"
              min={1}
              onFocus={(e) => e.currentTarget.select()}
              value={targetValue ?? 1}
              onChange={(e) =>
                setTargetValues({ ...targetValues, [preset]: Number(e.target.value) || 0 })
              }
              onBlur={() => {
                // El reducer rechaza un target no entero >= 1 (issue #964).
                if (!targetValid) setTargetValues({ ...targetValues, [preset]: 1 });
              }}
              aria-label={t("scoreSetup.targetValue")}
              className="w-24 rounded-chip border border-border bg-background px-2.5 py-1.5 text-right font-mono text-[15px] tabular-nums"
            />
          </div>
        )}
      </section>

      {/* Cuántos sois: para TODOS los presets — «Jugar ya» arranca con esto. */}
      <fieldset>
        <legend className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("setup.players")}
        </legend>
        <div className="flex gap-2">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={players === n}
              onClick={() => setPlayers(n)}
              className={CHIP(players === n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

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
          href={configureHref}
          className={buttonVariants("secondary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("tools.score.configure")}
        </Link>
      </div>
    </>
  );
}
