"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayStore } from "@/lib/play/core/store";
import type { CommanderDamageEvent, PoisonChangedEvent } from "@/lib/play/mtg/events";
import type { MtgPlayerState, MtgState } from "@/lib/play/mtg/types";
import { modeConfig } from "@/lib/play/mtg/modes";
import { commanderDamageBreakdown, lossConditions } from "@/lib/play/mtg/rules";
import { fitDamageChips } from "@/lib/play/ui/damage-strip";
import { seatAccent } from "@/lib/play/ui/seats";
import { DamageOverlay } from "./damage-overlay";

// Fábricas fuera del componente: el motor exige que el reloj lo ponga quien llama, y
// `Date.now()` en el cuerpo de un render rompe la regla de pureza de React.
function poisonEvent(target: string, delta: number): PoisonChangedEvent {
  return makeEvent<PoisonChangedEvent["type"], PoisonChangedEvent["payload"]>(
    "poison_changed",
    { target, delta },
    Date.now(),
  );
}

function damageEvent(source: string, target: string, delta: number): CommanderDamageEvent {
  return makeEvent<CommanderDamageEvent["type"], CommanderDamageEvent["payload"]>(
    "commander_damage",
    { source, target, delta },
    Date.now(),
  );
}

/** Rayado del estado letal: el color NUNCA es el único medio (WCAG 1.4.1). */
const LETHAL_STRIPES =
  "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.22) 6px 12px)";

/**
 * Veneno y daño de comandante: **botones de 44 px de dibujo**, no chips de 10. No
 * llevan `tap-44`: esa utilidad pone un pseudo-elemento y el panel tiene
 * `overflow: hidden`, que lo recorta — lo advierte el propio `globals.css`. Donde la
 * utilidad no llega, el control mide lo que se toca.
 *
 * Se apilan solos en un panel estrecho (el reparto de cinco): ahí sobra alto y falta
 * ancho, y `flex-wrap` con un ancho mínimo hace exactamente eso sin medir nada.
 *
 * Monarca e iniciativa NO están aquí: no son contadores, son un testigo que solo
 * tiene una persona y se pulsa una vez cada muchos turnos. Bajan a la hoja del
 * jugador; en el panel queda su insignia.
 */
export function PanelActions({
  state,
  player,
  store,
}: {
  state: MtgState;
  player: MtgPlayerState;
  store: PlayStore;
}) {
  const t = useTranslations("play");
  const [showDamage, setShowDamage] = useState(false);
  const config = modeConfig(state.setup.mode);
  const conditions = lossConditions(state, player.participant.id);
  const name = player.participant.name;

  const poisonLethal = conditions.includes("poison");
  const rows = commanderDamageBreakdown(state, player.participant.id);
  // El hueco sale del número de rivales que de verdad han pegado: tres fichas es lo
  // que entra cómodo en un panel de mesa de cuatro.
  const { visible, overflow } = fitDamageChips(rows, 3);
  const damageLethal = conditions.includes("commander_damage");

  function addPoison() {
    store.tap(poisonEvent(player.participant.id, 1));
  }

  function addDamage(commanderId: string, delta: number) {
    store.tap(damageEvent(commanderId, player.participant.id, delta));
  }

  return (
    <>
      {/* `relative` NO es decoración: las mitades de ±1 están posicionadas, y en CSS
          un elemento posicionado pinta por ENCIMA de los que están en flujo aunque
          vayan antes en el DOM. Sin esto, tocar «veneno» o «comandante» sumaba vida.
          Con `relative`, ambos están en la misma capa y manda el orden del DOM.

          **Chips de esquina, no medias filas** (revisión sobre partida real,
          2026-08-30): los contadores son situacionales y a lo ancho pesaban como si
          fueran lo principal. Ancho al contenido y alineados a la izquierda; los
          44 px de ALTO se quedan — son el objetivo del pulgar (`tap-44` aquí no
          sirve: su pseudo-elemento lo recorta el overflow del panel). Un contador a
          cero enseña solo el icono, atenuado: sitio mínimo hasta que exista. Este
          racimo es donde los contadores genéricos (energía, experiencia…) entrarán
          como chips cuando el motor los tenga — ver la issue de contadores. */}
      <div className="relative flex shrink-0 flex-wrap items-center gap-1 px-1.5 pb-1.5">
        <button
          type="button"
          onClick={addPoison}
          aria-label={t("board.poison", { name, count: player.poison })}
          style={poisonLethal ? { backgroundImage: LETHAL_STRIPES } : undefined}
          className={`flex h-11 items-center gap-1.5 rounded-chip border px-3 text-[13px] ${
            poisonLethal
              ? "border-play-danger bg-play-danger/20 text-play-danger"
              : player.poison > 0
                ? "border-border bg-surface-muted"
                : "border-transparent bg-surface-muted/60 text-muted-foreground"
          }`}
        >
          <PoisonIcon className="h-4 w-4" />
          {player.poison > 0 && (
            <span
              className={`font-mono tabular-nums ${poisonLethal ? "underline decoration-2 underline-offset-4" : ""}`}
            >
              {player.poison}
            </span>
          )}
        </button>

        {config.hasCommanderDamage && (
          <button
            type="button"
            onClick={() => setShowDamage(true)}
            aria-label={t("board.commanderDamage", { name })}
            style={damageLethal ? { backgroundImage: LETHAL_STRIPES } : undefined}
            className={`flex h-11 items-center gap-1.5 rounded-chip border px-3 text-[13px] ${
              damageLethal
                ? "border-play-danger bg-play-danger/20 text-play-danger"
                : visible.length > 0
                  ? "border-border bg-surface-muted"
                  : "border-transparent bg-surface-muted/60 text-muted-foreground"
            }`}
          >
            <SwordIcon className="h-4 w-4 shrink-0" />
            {visible.length > 0 && (
              <span className="flex min-w-0 items-center gap-1.5">
                {visible.map((row) => {
                  const owner = state.players.findIndex((p) => p.participant.id === row.sourceId);
                  return (
                    <span key={row.commanderId} className="flex items-center gap-1">
                      <span
                        aria-hidden
                        className={`${seatAccent(owner).bar} h-3.5 w-1 rounded-full`}
                      />
                      <span
                        className={`font-mono tabular-nums ${
                          row.lethal ? "underline decoration-2 underline-offset-4" : ""
                        }`}
                      >
                        {row.amount}
                      </span>
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {t("board.more", { count: overflow })}
                  </span>
                )}
              </span>
            )}
          </button>
        )}
      </div>

      {showDamage && (
        <DamageOverlay
          state={state}
          victimId={player.participant.id}
          onDamage={addDamage}
          onClose={() => setShowDamage(false)}
        />
      )}
    </>
  );
}

function PoisonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="9" r="5.5" />
      <circle cx="10" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 17h7M9.5 20h5" strokeLinecap="round" />
    </svg>
  );
}

function SwordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M18.5 3.5 9 13l2 2 9.5-9.5V3.5h-2Z" strokeLinejoin="round" />
      <path d="m8 14-2.5 2.5 4 4L12 18" strokeLinejoin="round" />
      <path d="m4.5 19.5 1.5 1.5" strokeLinecap="round" />
    </svg>
  );
}
