"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { initials } from "./seat-token";
import { SeatRow } from "./seat-row";

/**
 * Selector de jugadores de los acompañantes (Aleatorio, Reloj, Recursos,
 * Turnos): fichas en vez de formulario. Tocar una ficha de color la abre en
 * un panel con «Quitar de la mesa» — nunca quita al toque (un roce en la mesa
 * borraba a alguien sin deshacer). Tocar un habitual atenuado lo sienta; el
 * «+» despliega el input y su botón de alta. Los duplicados y el límite de
 * jugadores se explican sin descartar el nombre escrito.
 *
 * No se renombra aquí: los acompañantes identifican al jugador por nombre y
 * renombrar sería quitar + añadir (Recursos perdería sus valores).
 */
export function SeatPicker({
  identity,
  players,
  max,
  onChange,
  align = "start",
  idPrefix,
}: {
  identity: string;
  players: string[];
  max?: number;
  onChange: (players: string[]) => void;
  align?: "start" | "center";
  idPrefix: string;
}) {
  const t = useTranslations("play.seats");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const inputId = `${idPrefix}-add-player`;
  const feedbackId = `${idPrefix}-add-player-feedback`;
  const panelId = `${idPrefix}-seat`;

  function add(candidate: string, fromInput = false) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed)) return;
    if (max !== undefined && players.length >= max) return;
    onChange([...players, trimmed]);
    if (fromInput) {
      setName("");
      setAdding(false);
    }
  }

  function remove(target: string) {
    onChange(players.filter((x) => x !== target));
    setOpen(null);
  }

  const available = regulars.filter((r) => !players.includes(r.name));
  const full = max !== undefined && players.length >= max;
  const trimmedName = name.trim();
  const duplicate = trimmedName !== "" && players.includes(trimmedName);
  const feedback = full
    ? t("maxPlayersReached", { max: max ?? players.length })
    : adding && duplicate
      ? t("duplicatePlayer", { name: trimmedName })
      : null;
  const opened = open !== null && players.includes(open) ? open : null;

  return (
    <>
      <SeatRow
        seats={players.map((p) => ({ id: p, caption: p, content: initials(p), selected: p === opened }))}
        onSeatTap={(id) => setOpen(id === opened ? null : id)}
        panelId={panelId}
        regulars={available}
        regularsQuery={adding ? name : ""}
        onSeatRegular={(r) => add(r.name)}
        canAdd={!full}
        adding={adding}
        onAdd={() => setAdding(!adding)}
        addControls={inputId}
        align={align}
      />
      {opened !== null ? (
        <div
          id={panelId}
          className={`mt-2 flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3 py-2 ${
            align === "center" ? "mx-auto w-fit" : ""
          }`}
        >
          <span className="text-[14px] font-semibold">{opened}</span>
          <button
            type="button"
            onClick={() => remove(opened)}
            className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] text-muted-foreground"
          >
            {t("remove", { name: opened })}
          </button>
        </div>
      ) : null}
      {adding ? (
        <div id={inputId} className={`mt-2 flex items-center gap-2 ${align === "center" ? "justify-center" : ""}`}>
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(name, true);
            }}
            aria-label={t("nameLabel")}
            aria-invalid={duplicate || full}
            aria-describedby={feedback === null ? undefined : feedbackId}
            className="min-w-0 w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <button
            type="button"
            disabled={trimmedName === "" || duplicate || full}
            onClick={() => add(name, true)}
            className="tap-44 shrink-0 rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
          >
            {t("add")}
          </button>
        </div>
      ) : null}
      {feedback !== null ? (
        <p
          id={feedbackId}
          role="status"
          className={`mt-2 break-words text-[13px] ${full ? "text-muted-foreground" : "text-play-danger"} ${align === "center" ? "text-center" : ""}`}
        >
          {feedback}
        </p>
      ) : null}
    </>
  );
}
