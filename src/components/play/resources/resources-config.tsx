"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourcesState } from "@/lib/play/resources/types";
import {
  RESOURCES_MAX_DEFS,
  RESOURCES_MAX_PLAYERS,
  RESOURCE_VALUE_MAX,
  RESOURCE_VALUE_MIN,
} from "@/lib/play/resources/reducer";

/**
 * Configuración del gestor: jugadores (habituales a un toque, patrón reloj) y
 * recursos (nombre + emoji opcional + inicial + compartido). Cada cambio
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
  const [resName, setResName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [initial, setInitial] = useState("");
  const [shared, setShared] = useState(false);

  function addPlayer(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || state.players.includes(trimmed)) return;
    if (state.players.length >= RESOURCES_MAX_PLAYERS) return;
    emit("players_set", { players: [...state.players, trimmed] });
    setName("");
  }

  const chips = regulars.filter((r) => !state.players.includes(r.name)).slice(0, 6);

  const parsedInitial = initial === "" ? 0 : Number(initial);
  const addValid =
    resName.trim() !== "" &&
    !state.defs.some((d) => d.name === resName.trim()) &&
    state.defs.length < RESOURCES_MAX_DEFS &&
    Number.isInteger(parsedInitial) &&
    parsedInitial >= RESOURCE_VALUE_MIN &&
    parsedInitial <= RESOURCE_VALUE_MAX &&
    emoji.trim().length <= 8;

  function addResource() {
    if (!addValid) return;
    emit("resource_added", {
      name: resName.trim(),
      emoji: emoji.trim(),
      initial: parsedInitial,
      shared,
    });
    setResName("");
    setEmoji("");
    setInitial("");
    setShared(false);
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("players")}
      </p>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => addPlayer(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addPlayer(name);
          }}
          aria-label={t("nameLabel")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => addPlayer(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>
      {state.players.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {state.players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() =>
                  emit("players_set", { players: state.players.filter((x) => x !== p) })
                }
                aria-label={t("removePlayer", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("resources")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={resName}
          placeholder={t("resourcePlaceholder")}
          onChange={(e) => setResName(e.target.value)}
          aria-label={t("resourceName")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <input
          value={emoji}
          placeholder="🪙"
          onChange={(e) => setEmoji(e.target.value)}
          aria-label={t("emojiLabel")}
          className="w-14 rounded-md border border-border bg-surface px-2 py-1.5 text-center text-[14px]"
        />
        <input
          type="number"
          inputMode="numeric"
          value={initial}
          placeholder="0"
          onChange={(e) => setInitial(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("initialLabel")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t("sharedLabel")}
        </label>
        <button
          type="button"
          disabled={!addValid}
          onClick={addResource}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("addResource")}
        </button>
      </div>
      {state.defs.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {state.defs.map((d) => (
            <li key={d.name}>
              <button
                type="button"
                onClick={() => emit("resource_removed", { name: d.name })}
                aria-label={t("removeResource", { name: d.name })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {d.emoji ? `${d.emoji} ` : ""}
                {d.name} · {d.initial}
                {d.shared ? ` · ${t("bank")}` : ""} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
