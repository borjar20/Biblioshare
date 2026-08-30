"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { commanderOwners, type MtgState } from "@/lib/play/mtg/types";
import { modeConfig } from "@/lib/play/mtg/modes";
import { seatAccent, type SeatAccent } from "@/lib/play/ui/seats";

export type DamageTarget = {
  commanderId: string;
  label: string;
  ownerName: string;
  seat: number;
  amount: number;
  /** Comandante del PROPIO afectado: también cuenta (robos, peleas, redirecciones). */
  self: boolean;
};

/** Mantener pulsado este tiempo revela las mitades de −/+. */
const LONG_PRESS_MS = 425;

/**
 * Reparto de daño de comandante, DENTRO del panel: hereda su rotación, así que quien
 * está sentado ahí lo ve derecho.
 *
 * Una celda por comandante rival, **no por jugador**: con partner, Tymna y Thrasios
 * son dos cuentas de 21 distintas y sumarlas mataría antes de tiempo.
 *
 * **El número ES el control** (revisión sobre partida real, 2026-08-30): tocar la
 * celda suma 1 —la ráfaga funde los toques seguidos en un solo evento— y MANTENERLA
 * pulsada revela las mitades de −/+, la misma anatomía que las vidas del panel. Las
 * celdas van en rejilla compacta para que TODOS los rivales quepan a la vez sin
 * desplazarse. La pulsación larga no tiene equivalente de teclado; el camino sin
 * puntero es tocar (+1, accesible como botón) y deshacer desde la consola — y una
 * vez reveladas, las mitades son botones de verdad, enfocables.
 */
export function DamageOverlay({
  state,
  victimId,
  onDamage,
  onClose,
}: {
  state: MtgState;
  victimId: string;
  onDamage: (commanderId: string, delta: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  const victim = state.players.find((p) => p.participant.id === victimId);
  if (!victim) return null;

  const owners = commanderOwners(state);
  // El umbral letal es del MODO (rules lo lee de la misma tabla), no un 21 escrito.
  const threshold = modeConfig(state.setup.mode).commanderDamageThreshold;
  // Los rivales primero y el comandante PROPIO al final: también puede hacerte los
  // 21 (te lo roban, una pelea, una redirección — la regla cuenta el daño del
  // comandante, no quién lo controla), pero es el caso raro y no debe estar donde
  // caen los pulgares.
  const targets: DamageTarget[] = [];
  for (const pass of ["rivals", "own"] as const) {
    state.players.forEach((player, seat) => {
      const self = player.participant.id === victimId;
      if ((pass === "own") !== self) return;
      for (const commander of player.participant.commanders) {
        targets.push({
          commanderId: commander.id,
          label: commander.name?.trim() || player.participant.name,
          ownerName: player.participant.name,
          seat,
          amount: victim.commanderDamage[commander.id] ?? 0,
          self,
        });
      }
    });
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("board.damageTitle")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("board.close")}
          className="grid h-8 w-8 place-items-center rounded-chip border border-border text-[12px]"
        >
          ✕
        </button>
      </div>

      {/* `auto-rows-fr` reparte el ALTO disponible entre las filas: quepan 2 o 5,
          nunca hay que desplazarse — desplazarse con la mesa llena era justo lo que
          esta rejilla vino a quitar. */}
      <ul className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-1.5 px-2 pb-2">
        {targets.map((target) => {
          const owner = owners.get(target.commanderId);
          const showOwner = target.label !== target.ownerName && owner !== undefined;
          const detail = target.self ? t("board.you") : showOwner ? target.ownerName : null;
          return (
            <DamageCell
              key={target.commanderId}
              target={target}
              accent={seatAccent(target.seat)}
              detail={detail}
              lethal={target.amount >= threshold}
              onDamage={(delta) => onDamage(target.commanderId, delta)}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** Rayado del estado letal: el color NUNCA es el único medio (WCAG 1.4.1). */
const LETHAL_STRIPES =
  "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.22) 6px 12px)";

function DamageCell({
  target,
  accent,
  detail,
  lethal,
  onDamage,
}: {
  target: DamageTarget;
  accent: SeatAccent;
  /** Lo que va tras el nombre: el dueño del comandante, o «tuyo» si es el propio. */
  detail: string | null;
  lethal: boolean;
  onDamage: (delta: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  function press() {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setExpanded(true);
    }, LONG_PRESS_MS);
  }
  function release() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }
  function tap() {
    // El click llega DESPUÉS de la pulsación larga que acaba de expandir: ese no
    // debe sumar además un +1.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onDamage(1);
  }

  const frame = `relative flex min-h-0 select-none flex-col items-center justify-center overflow-hidden rounded-[10px] border ${
    lethal ? "border-play-danger bg-play-danger/20 text-play-danger" : "border-border bg-surface-muted"
  }`;
  const caption = (
    <span className="flex max-w-full items-center gap-1 px-1 text-[11px] leading-tight">
      <span aria-hidden className={`${accent.bar} h-3 w-1 shrink-0 rounded-full`} />
      <span className="truncate font-semibold">{target.label}</span>
      {detail && <span className="truncate text-muted-foreground">· {detail}</span>}
    </span>
  );
  const amount = (
    <span
      className={`font-mono text-[20px] font-medium tabular-nums leading-none ${
        lethal ? "underline decoration-2 underline-offset-4" : ""
      }`}
    >
      {target.amount}
    </span>
  );

  if (expanded) {
    return (
      <li
        className={frame}
        style={lethal ? { backgroundImage: LETHAL_STRIPES } : undefined}
      >
        {/* Mitades como las de las vidas: izquierda resta, derecha suma. Botones de
            verdad — una vez reveladas, el teclado también llega. */}
        <button
          type="button"
          onClick={() => onDamage(-1)}
          aria-label={`${target.label} −1`}
          className="absolute inset-y-0 left-0 w-1/2"
        >
          <span aria-hidden className="absolute left-2 top-1/2 -translate-y-1/2 font-mono opacity-45">
            −
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDamage(1)}
          aria-label={`${target.label} +1`}
          className="absolute inset-y-0 right-0 w-1/2"
        >
          <span aria-hidden className="absolute right-2 top-1/2 -translate-y-1/2 font-mono opacity-45">
            +
          </span>
        </button>
        <span className="pointer-events-none flex flex-col items-center gap-0.5">
          {caption}
          {amount}
        </span>
      </li>
    );
  }

  return (
    <li className="contents">
      <button
        type="button"
        onClick={tap}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`${target.label} +1`}
        className={frame}
        style={lethal ? { backgroundImage: LETHAL_STRIPES } : undefined}
      >
        {caption}
        {amount}
      </button>
    </li>
  );
}
