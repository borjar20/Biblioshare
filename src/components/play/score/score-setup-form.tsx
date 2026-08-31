"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import type { Participant } from "@/lib/play/core/types";
import type { ScoreDirection, ScoreSetup, ScoreTarget } from "@/lib/play/score/types";
import { seatAccent } from "@/lib/play/ui/seats";
import { buttonVariants } from "@/components/ui/button";
import { parseScorePreset, scoreTargetForPreset, type ScorePresetId } from "./score-preset-chooser";

const FIELD =
  "w-full rounded-chip border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_PLAYERS = 4;

type DraftPlayer = { id: string; name: string; playerId?: string };

/**
 * Borrador de la configuración. Espejo ALIGERADO de `setup-draft.ts`: sin
 * modos, sin mazos, sin comandantes — un asiento aquí es solo un nombre. El
 * `target` se separa en tres campos (kind/value/active) en vez de
 * `ScoreTarget | undefined` porque «desactivar» tiene que CONSERVAR el
 * último número escrito: si el usuario apaga el límite y se arrepiente, no
 * vuelve a un 0 en blanco.
 */
type ScoreDraft = {
  direction: ScoreDirection;
  targetKind: "rounds" | "points";
  targetValue: number;
  targetActive: boolean;
  players: DraftPlayer[];
};

const playerId = (index: number) => `p${index + 1}`;

function emptyPlayers(count: number): DraftPlayer[] {
  return Array.from({ length: count }, (_, i) => ({ id: playerId(i), name: "" }));
}

/** Borrador nuevo, prefijado por el preset (spec §5: el preset SOLO prefija). */
function newScoreDraft(preset: ScorePresetId): ScoreDraft {
  const target = scoreTargetForPreset(preset);
  return {
    direction: "highest",
    targetKind: target?.kind ?? "rounds",
    targetValue: target?.value ?? 10,
    targetActive: target !== undefined,
    players: emptyPlayers(DEFAULT_PLAYERS),
  };
}

/** Revancha: la mesa entera puesta, leída de la partida en curso/terminada. */
function draftFromScoreSetup(setup: ScoreSetup): ScoreDraft {
  return {
    direction: setup.direction,
    targetKind: setup.target?.kind ?? "rounds",
    targetValue: setup.target?.value ?? 10,
    targetActive: setup.target !== undefined,
    players: setup.participants.map((participant, i) => ({
      id: playerId(i),
      name: participant.name,
      ...(participant.kind === "regular" ? { playerId: participant.playerId } : {}),
    })),
  };
}

function setPlayerCount(draft: ScoreDraft, count: number): ScoreDraft {
  const next = Math.min(Math.max(count, MIN_PLAYERS), MAX_PLAYERS);
  const players =
    next <= draft.players.length
      ? draft.players.slice(0, next)
      : [
          ...draft.players,
          ...Array.from({ length: next - draft.players.length }, (_, i) => ({
            id: playerId(draft.players.length + i),
            name: "",
          })),
        ];
  return { ...draft, players };
}

function updatePlayerName(draft: ScoreDraft, index: number, name: string): ScoreDraft {
  const players = draft.players.map((player, i) => {
    if (i !== index) return player;
    // Igual que setup-draft.ts: editar el nombre de un asiento asignado lo
    // degrada a invitado -- el nombre es lo único que identifica al
    // habitual en pantalla (spec §6).
    if (player.playerId !== undefined) {
      const { playerId: _playerId, ...rest } = player;
      return { ...rest, name };
    }
    return { ...player, name };
  });
  return { ...draft, players };
}

function trimmed(value: string): string | undefined {
  const clean = value.trim();
  return clean === "" ? undefined : clean;
}

function toScoreSetup(draft: ScoreDraft, fallbackName: (index: number) => string): ScoreSetup {
  const participants: Participant[] = draft.players.map((player, i) => {
    const name = trimmed(player.name) ?? fallbackName(i);
    if (player.playerId) return { id: player.id, kind: "regular", name, playerId: player.playerId };
    return { id: player.id, kind: "guest", name };
  });
  const target: ScoreTarget | undefined = draft.targetActive
    ? { kind: draft.targetKind, value: draft.targetValue }
    : undefined;
  return { participants, direction: draft.direction, target };
}

/**
 * Configuración de puntuación. Espejo aligerado de `setup-form.tsx`:
 *
 * - Sin modo que leer del motor: el preset (`?preset=`) solo decide el
 *   prefill del límite, nunca el tipo de partida — a diferencia de mtg no
 *   hay nada que el motor rechace por «modo equivocado».
 * - `?revancha=1` NO usa `table-memory` (tipada a mtg, spec §5: solo se
 *   reutiliza si encaja sin tocarla, y aquí no encaja). El prerrelleno de
 *   revancha se lee en su lugar de la partida activa/terminada QUE YA HAY
 *   EN EL STORE, antes de descartarla — si esa partida no es de puntuación
 *   o no hay ninguna, caen los valores por defecto (issue pendiente: mesa
 *   recordada propia de puntuación, no abierta aquí).
 * - Sin asiento inicial: puntuación no tiene turno que rotar, así que la
 *   revancha no necesita el equivalente a `rotateStartingSeat`.
 */
export function ScoreSetupForm({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  const searchParams = useSearchParams();
  const preset = parseScorePreset(searchParams.get("preset"));
  // Revancha (desde el resumen) y reconfiguración (desde la hoja, con la
  // partida viva) comparten prefill: la mesa actual entera. La diferencia es
  // solo desde dónde llegas — en ambos casos entrar no descarta nada y
  // «Empezar» es lo que reinicia.
  const isRematch =
    searchParams.get("revancha") === "1" || searchParams.get("reconfigurar") === "1";
  // El chooser arrastra sus números por query para que las dos pantallas no
  // se contradigan (revisión 2026-08-31). Valores basura se ignoran: caen al
  // prefill del preset.
  const requestedPlayers = Number(searchParams.get("jugadores"));
  const requestedTarget = Number(searchParams.get("n"));

  const { snapshot, store } = useActiveGame(identity);

  // Partida de la que prerrellenar en revancha: la current del store, leída
  // ANTES de que `start()` la descarte. `snapshot.game` es estable entre
  // renders mientras nadie escribe en el store, así que sirve de dependencia.
  const rematchSetup = useMemo(() => {
    if (!isRematch || snapshot.status !== "ready" || !snapshot.game) return null;
    return snapshot.game.state.toolId === "score" ? snapshot.game.state.setup : null;
  }, [isRematch, snapshot]);

  const base = useMemo<ScoreDraft>(() => {
    if (rematchSetup) return draftFromScoreSetup(rematchSetup);
    let draft = newScoreDraft(preset);
    if (Number.isInteger(requestedPlayers) && requestedPlayers >= MIN_PLAYERS && requestedPlayers <= MAX_PLAYERS) {
      draft = setPlayerCount(draft, requestedPlayers);
    }
    if (draft.targetActive && Number.isInteger(requestedTarget) && requestedTarget >= 1) {
      draft = { ...draft, targetValue: requestedTarget };
    }
    return draft;
  }, [rematchSetup, preset, requestedPlayers, requestedTarget]);

  const [edited, setEdited] = useState<ScoreDraft | null>(null);
  const draft = edited ?? base;

  const seatName = (index: number) =>
    draft.players[index].name.trim() || t("setup.playerN", { n: index + 1 });

  function start() {
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    // Guarda ANTES de descartar: si el límite está activo con un valor que el
    // reducer rechaza (no entero >= 1, p. ej. el campo vaciado a mano), no se
    // toca nada — descartar aquí y que store.start() falle después borraría
    // la partida activa sin arrancar otra (issue #964, caso alcanzable desde
    // puntuación).
    if (draft.targetActive && (!Number.isInteger(draft.targetValue) || draft.targetValue < 1)) {
      return;
    }
    const setup = toScoreSetup(draft, (i) => t("setup.playerN", { n: i + 1 }));
    // Una sola partida activa (spec §4): `start()` LANZA si ya hay una, así
    // que la vieja se descarta aquí — pulsar «Empezar» ES pedir sustituirla.
    if (snapshot.game) store.discard();
    if (!store.start(makeEvent("game_started", { toolId: "score" as const, setup }, Date.now()))) {
      return; // setup que el motor rechaza: no se navega a un tablero que no existe
    }
    router.push("/partida/activa");
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-serif text-[24px] font-semibold">{t("setup.title")}</h1>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {t(draft.direction === "highest" ? "scoreSetup.captionHighest" : "scoreSetup.captionLowest")}
        </p>
      </header>

      <fieldset>
        <legend className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("setup.players")}
        </legend>
        <div className="flex gap-2">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={draft.players.length === n}
              onClick={() => setEdited(setPlayerCount(draft, n))}
              className={`tap-44 h-11 min-w-11 flex-1 rounded-chip border font-mono text-[15px] tabular-nums transition-colors ${
                draft.players.length === n
                  ? "border-accent bg-accent/10 text-accent-ink"
                  : "border-border bg-surface"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("scoreSetup.direction")}
        </legend>
        <div className="flex gap-2">
          {(["highest", "lowest"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              aria-pressed={draft.direction === direction}
              onClick={() => setEdited({ ...draft, direction })}
              className={`h-11 flex-1 rounded-chip border px-3 text-[13px] transition-colors ${
                draft.direction === direction
                  ? "border-accent bg-accent/10 text-accent-ink"
                  : "border-border bg-surface"
              }`}
            >
              {t(direction === "highest" ? "scoreSetup.highest" : "scoreSetup.lowest")}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("scoreSetup.target")}
        </legend>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={draft.targetActive}
            onClick={() => setEdited({ ...draft, targetActive: !draft.targetActive })}
            className={`h-11 shrink-0 rounded-chip border px-3 text-[13px] transition-colors ${
              draft.targetActive
                ? "border-accent bg-accent/10 text-accent-ink"
                : "border-border bg-surface"
            }`}
          >
            {t(draft.targetKind === "rounds" ? "scoreSetup.targetRounds" : "scoreSetup.targetPoints")}
          </button>
          {draft.targetActive && (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              onFocus={(e) => e.currentTarget.select()}
              value={draft.targetValue}
              onChange={(e) => setEdited({ ...draft, targetValue: Number(e.target.value) || 0 })}
              onBlur={() => {
                // El reducer rechaza un target que no sea entero >= 1 (issue
                // #964): sin esto un campo vaciado a mano dejaría un valor
                // inválido que `start()` no puede arrancar.
                if (!Number.isInteger(draft.targetValue) || draft.targetValue < 1) {
                  setEdited({ ...draft, targetValue: 1 });
                }
              }}
              aria-label={t("scoreSetup.targetValue")}
              className={`${FIELD} w-20 text-right font-mono tabular-nums`}
            />
          )}
        </div>
      </fieldset>

      {/* El botón ANTES que los nombres: empezar no exige leerlos (mismo
          criterio que setup-form.tsx tras la revisión UX 2026-08-30). */}
      <div>
        <button
          type="button"
          onClick={start}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("setup.start")}
        </button>
        <p className="mt-2 text-[12px] text-muted-foreground">{t("setup.emptyIsFine")}</p>
      </div>

      <details open={isRematch} className="rounded-card border border-border bg-surface px-3 py-2.5">
        <summary className="cursor-pointer text-[13px] font-semibold">
          {t("setup.table")}{" "}
          <span className="font-normal text-muted-foreground">
            · {draft.players.map((_, i) => seatName(i)).join(", ")}
          </span>
        </summary>

        <ul className="mt-3 flex flex-col gap-2">
          {draft.players.map((player, i) => {
            const accent = seatAccent(i);
            return (
              <li
                key={player.id}
                className="flex items-center gap-3 overflow-hidden rounded-card border border-border bg-surface"
              >
                <span aria-hidden className={`${accent.bar} w-1.5 shrink-0 self-stretch`} />
                <input
                  value={player.name}
                  onChange={(e) => setEdited(updatePlayerName(draft, i, e.target.value))}
                  placeholder={t("setup.playerN", { n: i + 1 })}
                  aria-label={t("setup.name")}
                  className={`${FIELD} my-2.5 mr-3 font-serif text-[15px] font-semibold`}
                />
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
