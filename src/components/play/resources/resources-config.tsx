"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourcesState } from "@/lib/play/resources/types";
import {
  RESOURCES_MAX_DEFS,
  RESOURCES_MAX_PLAYERS,
  RESOURCE_VALUE_MAX,
  RESOURCE_VALUE_MIN,
} from "@/lib/play/resources/reducer";
import { stableColor } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

const EMOJI_OPTIONS = ["🪙", "🌲", "💎", "❤️", "⚡", "🧱", "🐑", "🌾", "🪨", "⭐"];

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Configuración visual del gestor (spec recursos-visual §2): jugadores como
 * fichas de asiento (mismo lenguaje que el reloj — tocar quita, habituales
 * atenuados se encienden, la ficha «+» abre el input) y alta de recurso como
 * FICHA VIVA: la preview se construye al teclear/tocar (emoji del picker,
 * inicial con stepper con mantener, dueño con toggle segmentado). Cada cambio
 * emite: la config vive en el log como todo lo demás.
 */
export function ResourcesConfig({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
}) {
  const t = useTranslations("play.resources");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [resName, setResName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [initial, setInitial] = useState(0);
  const [initialPreview, setInitialPreview] = useState(0);
  const [shared, setShared] = useState(false);

  const clampInitial = (n: number) =>
    Math.min(RESOURCE_VALUE_MAX, Math.max(RESOURCE_VALUE_MIN, n));
  const shownInitial = clampInitial(initial + initialPreview);
  const commitInitial = (total: number) => {
    setInitial((v) => clampInitial(v + total));
    setInitialPreview(0);
  };
  const stepUp = useHoldRepeat({ step: 1, onPreview: setInitialPreview, onCommit: commitInitial });
  const stepDown = useHoldRepeat({
    step: -1,
    onPreview: setInitialPreview,
    onCommit: commitInitial,
  });

  function addPlayer(candidate: string, fromInput = false) {
    const trimmed = candidate.trim();
    if (trimmed === "" || state.players.includes(trimmed)) return;
    if (state.players.length >= RESOURCES_MAX_PLAYERS) return;
    emit("players_set", { players: [...state.players, trimmed] });
    // Solo el alta DESDE el input limpia y cierra: tocar un habitual con un
    // nombre a medio escribir no se traga el borrador (lección del reloj).
    if (fromInput) {
      setName("");
      setAdding(false);
    }
  }

  const regularTokens = regulars.filter((r) => !state.players.includes(r.name)).slice(0, 6);

  const trimmedRes = resName.trim();
  const addValid =
    trimmedRes !== "" &&
    !state.defs.some((d) => d.name === trimmedRes) &&
    state.defs.length < RESOURCES_MAX_DEFS;

  function addResource() {
    if (!addValid) return;
    emit("resource_added", { name: trimmedRes, emoji, initial, shared });
    setResName("");
    setEmoji("");
    setInitial(0);
    setInitialPreview(0);
    setShared(false);
  }

  const segClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("players")}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {state.players.map((p, i) => (
          <span key={p} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("removePlayer", { name: p })}
              title={p}
              onClick={() =>
                emit("players_set", { players: state.players.filter((x) => x !== p) })
              }
              className="flex h-11 w-11 select-none items-center justify-center rounded-full text-[14px] font-semibold text-surface"
              style={{ background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})` }}
            >
              {initials(p)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{p}</span>
          </span>
        ))}
        {regularTokens.map((r) => (
          <span key={r.playerId} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => addPlayer(r.name)}
              title={r.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground opacity-70"
            >
              {initials(r.name)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{r.name}</span>
          </span>
        ))}
        {state.players.length < RESOURCES_MAX_PLAYERS ? (
          <span className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("addPlayer")}
              aria-expanded={adding}
              aria-controls="resources-add-player"
              onClick={() => setAdding(!adding)}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[18px] font-semibold text-muted-foreground"
            >
              +
            </button>
            <span className="text-[10px] text-muted-foreground">{t("addPlayer")}</span>
          </span>
        ) : null}
      </div>
      {adding ? (
        <div id="resources-add-player" className="mt-2 flex justify-center">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPlayer(name, true);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("resources")}
      </p>

      {/* Ficha viva: la preview se construye con lo elegido. */}
      <div className="mt-2 flex items-center gap-4">
        <span
          aria-hidden
          className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-full text-surface ${
            trimmedRes === "" ? "border-2 border-dashed border-border" : ""
          }`}
          style={trimmedRes === "" ? undefined : { background: stableColor(trimmedRes) }}
        >
          <span className="text-[24px] leading-none">
            {emoji || (trimmedRes ? initials(trimmedRes) : "?")}
          </span>
          <span
            className={`text-[13px] font-semibold tabular-nums ${
              trimmedRes === "" ? "text-muted-foreground" : ""
            }`}
          >
            {shownInitial}
          </span>
        </span>
        <input
          value={resName}
          placeholder={t("resourcePlaceholder")}
          onChange={(e) => setResName(e.target.value)}
          aria-label={t("resourceName")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("emojiPicker")}>
        {EMOJI_OPTIONS.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={emoji === e}
            aria-label={t("emojiOption", { emoji: e })}
            onClick={() => setEmoji(emoji === e ? "" : e)}
            className={`flex h-10 w-10 items-center justify-center rounded-chip border text-[20px] ${
              emoji === e ? "border-foreground bg-surface-muted" : "border-border"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewerInitial")}
            disabled={initial <= RESOURCE_VALUE_MIN}
            {...stepDown.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            −
          </button>
          <span className="w-14 text-center text-[14px] font-semibold tabular-nums">
            {shownInitial}
          </span>
          <button
            type="button"
            aria-label={t("moreInitial")}
            disabled={initial >= RESOURCE_VALUE_MAX}
            {...stepUp.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            +
          </button>
        </span>
        <span className="inline-flex gap-1" role="group" aria-label={t("owner")}>
          <button
            type="button"
            aria-pressed={!shared}
            onClick={() => setShared(false)}
            className={segClass(!shared)}
          >
            {t("ownerPlayers")}
          </button>
          <button
            type="button"
            aria-pressed={shared}
            onClick={() => setShared(true)}
            className={segClass(shared)}
          >
            {t("ownerBank")}
          </button>
        </span>
        <button
          type="button"
          disabled={!addValid}
          onClick={addResource}
          className="rounded-chip border border-border px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("create")}
        </button>
      </div>

      {state.defs.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3">
          {state.defs.map((d) => (
            <li key={d.name} className="flex w-16 flex-col items-center gap-1">
              <button
                type="button"
                aria-label={t("removeResource", { name: d.name })}
                title={d.name}
                onClick={() => emit("resource_removed", { name: d.name })}
                className="flex h-11 w-11 flex-col items-center justify-center rounded-full text-surface"
                style={{ background: stableColor(d.name) }}
              >
                <span className="text-[16px] leading-none">{d.emoji || initials(d.name)}</span>
                <span className="text-[10px] font-semibold tabular-nums">{d.initial}</span>
              </button>
              <span className="max-w-full truncate text-[10px] text-muted-foreground">
                {d.name}
                {d.shared ? ` · ${t("bank")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
