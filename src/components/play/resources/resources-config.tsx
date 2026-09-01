"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import { SeatPicker } from "@/components/play/ui/seat-picker";
import { initials } from "@/components/play/ui/seat-token";
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

const EMOJI_OPTIONS = ["🪙", "🌲", "💎", "❤️", "⚡", "🧱", "🐑", "🌾", "🪨", "⭐"];

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
      {/* Quitar un jugador REESCRIBE la lista entera: el reducer reconcilia
          los valores conservando a los supervivientes. */}
      <div className="mt-2">
        <SeatPicker
          identity={identity}
          players={state.players}
          max={RESOURCES_MAX_PLAYERS}
          onChange={(players) => emit("players_set", { players })}
          idPrefix="resources"
        />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("resources")}
      </p>

      {/* Ficha viva: la preview se construye con lo elegido. */}
      <div className="mt-2 flex items-center gap-4">
        {/* Vacía: fondo --surface-3 y texto atenuado (el «?» sobre el fondo de
            la tarjeta era invisible — review final). Con nombre: color estable
            y texto claro, como las mini-fichas. */}
        <span
          aria-hidden
          className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-full ${
            trimmedRes === ""
              ? "border-2 border-dashed border-border text-muted-foreground"
              : "text-surface"
          }`}
          style={
            trimmedRes === ""
              ? { background: "var(--surface-3)" }
              : { background: stableColor(trimmedRes) }
          }
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
                {d.shared ? ` · ${t("bank")}` : ""} ×
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
