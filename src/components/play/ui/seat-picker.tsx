"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { SeatToken, initials } from "./seat-token";

// Cuántos habituales se ofrecen como ficha: los mismos que `RegularPicker`
// enseña como chips. Más convierten el selector en una lista de contactos.
const MAX_REGULARS = 6;

/**
 * Selector de jugadores de los acompañantes (Aleatorio, Reloj, Recursos,
 * Turnos): fichas en vez de formulario. Tocar una ficha de color quita a ese
 * jugador; tocar un habitual atenuado lo sienta; el «+» despliega el ÚNICO
 * input de la pantalla (regla «juguete sobre formulario» — decisiones.md).
 *
 * Vive aquí, y no copiado en cada acompañante, porque los cuatro tienen que
 * verse iguales: cuando estaba triplicado, cada arreglo (el rótulo del «+»
 * descentrado) había que hacerlo tres veces y el cuarto ni siquiera tenía
 * fichas.
 *
 * El alta DESDE el input limpia y cierra; tocar un habitual con un nombre a
 * medio escribir NO se traga el borrador.
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
  /** Tope de jugadores. Sin él no hay límite (Aleatorio no lo tiene). */
  max?: number;
  onChange: (players: string[]) => void;
  align?: "start" | "center";
  /** Prefijo del id del input, para `aria-controls` sin colisiones. */
  idPrefix: string;
}) {
  const t = useTranslations("play.seats");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const inputId = `${idPrefix}-add-player`;

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

  const regularTokens = regulars.filter((r) => !players.includes(r.name)).slice(0, MAX_REGULARS);
  const full = max !== undefined && players.length >= max;
  const justify = align === "center" ? "justify-center" : "";

  return (
    <>
      <div className={`flex flex-wrap items-start gap-3 ${justify}`}>
        {players.map((p, i) => (
          <SeatToken
            key={p}
            variant="seat"
            seat={i}
            caption={p}
            label={t("remove", { name: p })}
            onClick={() => onChange(players.filter((x) => x !== p))}
          >
            {initials(p)}
          </SeatToken>
        ))}
        {regularTokens.map((r) => (
          <SeatToken
            key={r.playerId}
            variant="regular"
            caption={r.name}
            label={t("seat", { name: r.name })}
            onClick={() => add(r.name)}
          >
            {initials(r.name)}
          </SeatToken>
        ))}
        {full ? null : (
          <SeatToken
            variant="add"
            caption={t("add")}
            label={t("addPlayer")}
            expanded={adding}
            controls={inputId}
            onClick={() => setAdding(!adding)}
          />
        )}
      </div>
      {adding ? (
        <div id={inputId} className={`mt-2 flex ${justify}`}>
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(name, true);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}
    </>
  );
}
