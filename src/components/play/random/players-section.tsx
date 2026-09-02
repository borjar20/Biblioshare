"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SeatPicker } from "@/components/play/ui/seat-picker";
import { drawTeams, pickFirst, shuffle } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { PlayersWheel } from "./stage/players-wheel";
import { OrderReveal } from "./stage/order-reveal";
import { TeamsReveal } from "./stage/teams-reveal";

/**
 * Lista compartida de jugadores + tres sorteos. La ruleta ES el sorteo de
 * primer jugador (tap para girar); orden y equipos animan su revelado bajo
 * ella. Solo un players-result montado a la vez: la ruleta pinta el suyo si el
 * último sorteo es first_picked; si no, lo pinta el revelado correspondiente.
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
  const [teamCount, setTeamCount] = useState(2);

  // Cantidades válidas de equipos: 2..jugadores-1 (un equipo por jugador, o
  // uno solo, no cuentan como reparto). Chips, no un input numérico -- tocar
  // el botón no puede robarle el foco al campo (#visual-first).
  const teamOptions = Array.from({ length: Math.max(0, players.length - 2) }, (_, i) => i + 2);
  const teamsValid = teamOptions.includes(teamCount);
  const canDraw = players.length >= 2;

  const spin =
    lastResult && lastResult.type === "first_picked"
      ? { id: lastResult.id, picked: lastResult.payload.picked }
      : null;

  return (
    <div>
      <PlayersWheel
        players={players}
        spin={spin}
        onSpin={() => onFirst(players, pickFirst(players))}
        label={t("first")}
        disabled={!canDraw}
        hint={t("wheelHint")}
      />

      {lastResult?.type === "order_drawn" ? (
        <OrderReveal id={lastResult.id} order={lastResult.payload.order} />
      ) : null}
      {lastResult?.type === "teams_drawn" ? (
        <TeamsReveal
          id={lastResult.id}
          teams={lastResult.payload.teams}
          teamLabel={(n) => t("team", { n })}
        />
      ) : null}

      {/* Mismo selector de fichas que Reloj, Recursos y Turnos: la ruleta ya es
          el juguete de esta pantalla, la lista de jugadores no puede ser un
          formulario. Sin tope: aquí no hay mesa que quepa. */}
      <div className="mt-4">
        <SeatPicker
          identity={identity}
          players={players}
          onChange={onSetPlayers}
          idPrefix="random"
        />
      </div>

      {players.length < 2 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canDraw}
          onClick={() => onOrder(players, shuffle(players))}
          className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("order")}
        </button>
        <span className="flex flex-wrap gap-1" role="group" aria-label={t("teamCount")}>
          {teamOptions.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={teamCount === n}
              onClick={() => setTeamCount(n)}
              className={`tap-44 h-11 min-w-11 rounded-chip border px-3 font-mono text-[15px] tabular-nums ${
                teamCount === n ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
              }`}
            >
              {n}
            </button>
          ))}
        </span>
        <button
          type="button"
          disabled={!canDraw || !teamsValid}
          onClick={() => onTeams(players, drawTeams(players, teamCount))}
          className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("teams")}
        </button>
      </div>
    </div>
  );
}
