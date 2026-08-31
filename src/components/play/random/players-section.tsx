"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { drawTeams, pickFirst, shuffle } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";

/**
 * Lista compartida de jugadores + tres sorteos (spec §4). Los chips de
 * habituales solo salen con sesión (usePlayers con "anon" devuelve []); el
 * texto libre funciona siempre. Cada cambio de lista emite players_set con la
 * foto completa; cada sorteo resuelve el azar AQUÍ y emite el resultado.
 */
export function PlayersSection({
  identity,
  players,
  lastResult,
  onSetPlayers,
  onFirst,
  onOrder,
  onTeams,
}: {
  identity: string;
  players: string[];
  lastResult: RandomEvent | undefined;
  onSetPlayers: (players: string[]) => void;
  onFirst: (players: string[], picked: string) => void;
  onOrder: (players: string[], order: string[]) => void;
  onTeams: (players: string[], teams: string[][]) => void;
}) {
  const t = useTranslations("play.random.players");
  const tLog = useTranslations("play.random");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState("");

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed)) return;
    onSetPlayers([...players, trimmed]);
    setName("");
  }

  const chips = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const parsedTeams = Number(teamCount || "2");
  const teamsValid =
    Number.isInteger(parsedTeams) && parsedTeams >= 2 && parsedTeams <= players.length - 1;
  const canDraw = players.length >= 2;

  const last =
    lastResult &&
    (lastResult.type === "first_picked" ||
      lastResult.type === "order_drawn" ||
      lastResult.type === "teams_drawn")
      ? describeRandomEvent(lastResult)
      : null;

  return (
    <div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => add(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(name);
          }}
          aria-label={t("nameLabel")}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => add(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>

      {players.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onSetPlayers(players.filter((x) => x !== p))}
                aria-label={t("remove", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button
          type="button"
          disabled={!canDraw}
          onClick={() => onFirst(players, pickFirst(players))}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("first")}
        </button>
        <button
          type="button"
          disabled={!canDraw}
          onClick={() => onOrder(players, shuffle(players))}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("order")}
        </button>
        <label className="flex items-end gap-2">
          <span className="sr-only">{t("teamCount")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={2}
            value={teamCount}
            placeholder="2"
            onChange={(e) => setTeamCount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("teamCount")}
            className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <button
            type="button"
            disabled={!canDraw || !teamsValid}
            onClick={() => onTeams(players, drawTeams(players, parsedTeams))}
            className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
          >
            {t("teams")}
          </button>
        </label>
      </div>

      {last ? (
        <p className="mt-4 font-serif text-[18px] font-semibold" data-testid="players-result">
          {/* la clave del log ya formatea el resultado completo */}
          {tLog(`log.${last.key}`, last.params)}
        </p>
      ) : null}
    </div>
  );
}
