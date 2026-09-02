"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PlayerRecord } from "@/lib/play/core/db";
import { SeatToken } from "./seat-token";
import { RegularTokens } from "./regular-tokens";

export type SeatRowSeat = { id: string; caption: string; content: ReactNode; selected: boolean };

/**
 * Fila de fichas de una mesa, sin lógica de datos: asientos ocupados, habituales
 * por sentar y el «+». Tocar un asiento SELECCIONA (el llamador abre su panel):
 * quitar nunca es un toque en la ficha — vive dentro del panel. Antes la misma
 * ficha quitaba en los acompañantes y editaba en puntuación (critique 2026-09-01).
 */
export function SeatRow({
  seats,
  onSeatTap,
  panelId,
  regulars = [],
  regularsQuery = "",
  onSeatRegular,
  canAdd,
  canSeatRegulars,
  adding,
  onAdd,
  addControls,
  align = "start",
}: {
  seats: SeatRowSeat[];
  onSeatTap: (id: string) => void;
  /** id del panel que abre un asiento (aria-controls). */
  panelId: string;
  regulars?: PlayerRecord[];
  regularsQuery?: string;
  onSeatRegular?: (regular: { playerId: string; name: string }) => void;
  canAdd: boolean;
  /** Cuándo enseñar fichas de habituales por sentar; por defecto sigue a `canAdd`
   * (mesa llena sin asiento libre nunca las enseña), pero puede seguir su propia
   * regla — p. ej. mesa llena que aún tiene un asiento vacío por nombrar. */
  canSeatRegulars?: boolean;
  adding?: boolean;
  onAdd: () => void;
  /** id de lo que despliega el «+» (aria-controls). */
  addControls: string;
  align?: "start" | "center";
}) {
  const t = useTranslations("play.seats");
  return (
    <div className={`flex flex-wrap items-start gap-3 ${align === "center" ? "justify-center" : ""}`}>
      {seats.map((seat, i) => (
        <SeatToken
          key={seat.id}
          variant="seat"
          seat={i}
          caption={seat.caption}
          label={t("edit", { name: seat.caption })}
          selected={seat.selected}
          expanded={seat.selected}
          controls={panelId}
          onClick={() => onSeatTap(seat.id)}
        >
          {seat.content}
        </SeatToken>
      ))}
      {(canSeatRegulars ?? canAdd) && onSeatRegular ? (
        <RegularTokens regulars={regulars} query={regularsQuery} onSeat={onSeatRegular} />
      ) : null}
      {canAdd ? (
        <SeatToken
          variant="add"
          caption={t("add")}
          label={t("addPlayer")}
          expanded={adding}
          controls={addControls}
          onClick={onAdd}
        />
      ) : null}
    </div>
  );
}
