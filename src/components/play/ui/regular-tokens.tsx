"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PlayerRecord } from "@/lib/play/core/db";
import { visibleRegulars } from "@/lib/play/ui/regular-chips";
import { SeatToken, initials } from "./seat-token";

/** Fichas de habitual que caben sin empujar el resto de la pantalla. */
const FIRST_BATCH = 6;

/**
 * Fila de habituales del selector: fichas atenuadas que sientan a alguien de
 * «Tus jugadores» de un toque. Lo que no cabe en la primera tanda NO se pierde
 * — se ofrece en una ficha «+N» que despliega el resto — y con texto escrito
 * en el «+» se filtra por prefijo y se enseñan todas las coincidencias.
 *
 * Compartida por `SeatPicker` (acompañantes) y la mesa de puntuación, que
 * filtran distinto lo que ya está puesto (por nombre / por `playerId`) pero
 * enseñan lo mismo.
 */
export function RegularTokens({
  regulars,
  query = "",
  onSeat,
}: {
  /** Habituales que todavía se pueden sentar. */
  regulars: PlayerRecord[];
  /** Texto tecleado en el «+»: filtra por prefijo de palabra. */
  query?: string;
  onSeat: (regular: { playerId: string; name: string }) => void;
}) {
  const t = useTranslations("play.seats");
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = visibleRegulars(regulars, query, expanded, FIRST_BATCH);

  return (
    <>
      {shown.map((r) => (
        <SeatToken
          key={r.playerId}
          variant="regular"
          caption={r.name}
          label={t("seat", { name: r.name })}
          onClick={() => onSeat({ playerId: r.playerId, name: r.name })}
        >
          {initials(r.name)}
        </SeatToken>
      ))}
      {hidden > 0 ? (
        <SeatToken
          variant="add"
          caption={t("more")}
          label={t("moreRegulars", { n: hidden })}
          onClick={() => setExpanded(true)}
        >
          <span className="text-[14px]">+{hidden}</span>
        </SeatToken>
      ) : null}
    </>
  );
}
