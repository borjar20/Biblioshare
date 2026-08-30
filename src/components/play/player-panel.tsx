"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { lifeFontSize, type SeatPlacement } from "@/lib/play/ui/layout";
import { cardBackgroundTint, seatAccent } from "@/lib/play/ui/seats";
import type { MtgPlayerState } from "@/lib/play/mtg/types";

/**
 * Panel de un asiento. Tres reglas de la fase 1a que hay que respetar al tocarlo:
 *
 * 1. **Las mitades son BOTONES de verdad**, de media cara. En reposo apenas se ven;
 *    al pulsar, la mitad se tiñe del color del asiento. El feedback es de la ficha,
 *    no genérico.
 * 2. **La rotación es solo visual.** El orden del DOM es el de asientos siempre, así
 *    que quien navega con teclado o lector recorre la mesa en orden (spec §7).
 * 3. **La cabecera reserva el hueco de la consola flotante con padding**, no supone
 *    que ahí no haya nada: la variante que lo suponía se cae con un nombre largo o
 *    una insignia de monarca (decisión 2026-08-29 (6), invariante 1).
 */
export function PlayerPanel({
  player,
  seat,
  placement,
  isActive,
  isMonarch,
  hasInitiative,
  onLife,
  onOpenSheet,
  children,
}: {
  player: MtgPlayerState;
  seat: number;
  placement: SeatPlacement;
  isActive: boolean;
  isMonarch: boolean;
  hasInitiative: boolean;
  /** ±1 desde las mitades. Coalescido por el store: una ráfaga = un evento. */
  onLife: (delta: number) => void;
  onOpenSheet: () => void;
  /** Botonera de veneno y comandante; llega en su propia pieza. */
  children?: ReactNode;
}) {
  const t = useTranslations("play");
  const accent = seatAccent(seat);
  const cellRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [pressed, setPressed] = useState<"minus" | "plus" | null>(null);

  // El tamaño del número sale del panel Y de cuántos dígitos tenga. Se mide con un
  // ResizeObserver —y no en el cuerpo del efecto— para no llamar a setState de forma
  // síncrona dentro de él (lint `set-state-in-effect`): el observer dispara su
  // primera medida por su cuenta.
  useEffect(() => {
    const node = cellRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const lateral = placement.rotation === 90 || placement.rotation === -90;
  // `transform: rotate()` NO cambia la caja de layout: para poner un panel de canto
  // hay que darle a la caja interior las dimensiones INTERCAMBIADAS antes de girarla.
  //
  // SOLO los laterales (±90) usan esa caja medida y centrada. A 0 y a 180 la caja
  // girada es IDÉNTICA a la original, así que el contenido va en flujo normal con
  // `h-full w-full`: la geometría no depende de ninguna medida. La versión que
  // centraba TODAS las rotaciones con la medida del ResizeObserver se descuadraba
  // en móvil real —barra y botonera desplazadas o sobresaliendo— cuando la barra
  // del navegador aparecía o se escondía y la medida llegaba un frame tarde
  // (visto en la partida real del 2026-08-30; la medida queda solo para el tamaño
  // del número, donde un frame de retraso es invisible).
  const inner = lateral
    ? { width: size?.height ?? 0, height: size?.width ?? 0 }
    : { width: size?.width ?? 0, height: size?.height ?? 0 };

  const life = player.life;
  const fontSize = size
    ? lifeFontSize({ width: inner.width, height: inner.height, digits: String(Math.abs(life)).length })
    : undefined;

  // Sin fondo elegido, el panel se tiñe del color de SU asiento — no se queda en la
  // superficie plana. Es lo que el setup ya enseñaba como elegido por defecto, pero
  // el borrador solo guardaba el fondo si lo TOCABAS: con «Jugar ya» o sin tocar los
  // swatches, cardBackground llegaba undefined y la mesa salía monocroma (bug
  // encontrado en la primera partida real, 2026-08-30). El fallback vive aquí y no
  // en toSetup para que también repare partidas ya guardadas.
  const background =
    cardBackgroundTint(player.participant.cardBackground) ?? accent.tint;
  const name = player.participant.name;
  const commanders = player.participant.commanders
    .map((commander) => commander.name?.trim())
    .filter(Boolean)
    .join(" + ");

  return (
    <div
      ref={cellRef}
      style={{ gridArea: placement.area }}
      className={`relative overflow-hidden rounded-[20px] bg-surface ${
        isActive ? `ring-2 ${accent.ring}` : ""
      }`}
    >
      {/* El fondo de la tarjeta es del JUGADOR; el color de asiento, del sistema. Por
          eso el tinte va DEBAJO de todo y la barra del asiento no desaparece nunca.
          Cuando lleguen las imágenes irán aquí, siempre bajo un velo de la propia
          superficie: el número se lee por el velo, no por la suerte de la imagen. */}
      <span aria-hidden className={`absolute inset-0 ${background}`} />
      <div
        className={
          lateral
            ? "absolute left-1/2 top-1/2"
            : `h-full w-full ${placement.rotation === 180 ? "rotate-180" : ""}`
        }
        style={
          lateral
            ? {
                width: inner.width || undefined,
                height: inner.height || undefined,
                transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
              }
            : undefined
        }
      >
        <div className="relative flex h-full w-full flex-col">
          {/* La barra del asiento mira siempre al centro de la mesa: va arriba del
              contenido, que ya está girado. */}
          <span aria-hidden className={`${accent.bar} h-1.5 w-full shrink-0`} />

          {/* Tocar la cabecera abre la hoja del jugador. Un toque, no una pulsación
              larga: no se descubre, no tiene equivalente con teclado y en móvil
              compite con los gestos nativos del navegador. El padding lateral RESERVA
              el hueco de la consola flotante. */}
          <button
            type="button"
            onClick={onOpenSheet}
            aria-label={t("board.openSheet", { name })}
            className="flex min-w-0 shrink-0 items-baseline gap-1.5 px-9 pt-1.5 text-left"
          >
            <span className="min-w-0 truncate font-serif text-[13px] font-semibold">{name}</span>
            {commanders && (
              <span className="min-w-0 truncate text-[10px] text-muted-foreground">{commanders}</span>
            )}
            {/* Monarca e iniciativa no son contadores: son un testigo que solo tiene
                una persona y se pasa una vez cada muchos turnos. Como botón sobraban,
                así que aquí queda solo la INSIGNIA y la acción vive en la hoja. */}
            {isMonarch && (
              <span title={t("board.monarch")} className="shrink-0 text-[11px]">
                <span className="sr-only">{t("board.monarch")}</span>
                <span aria-hidden>♛</span>
              </span>
            )}
            {hasInitiative && (
              <span title={t("board.initiative")} className="shrink-0 text-[11px]">
                <span className="sr-only">{t("board.initiative")}</span>
                <span aria-hidden>⚑</span>
              </span>
            )}
          </button>

          {/* Las mitades van ANTES que el número y que la botonera en el DOM: así
              quedan por debajo de ellos y tocar un botón no suma vida de rebote.
              Empiezan bajo la cabecera (`top-7`) por lo mismo. */}
          <LifeHalf
            side="left"
            label={t("board.minusOne", { name })}
            accent={accent.tint}
            pressed={pressed === "minus"}
            onPressChange={(on) => setPressed(on ? "minus" : null)}
            onCommit={() => onLife(-1)}
          />
          <LifeHalf
            side="right"
            label={t("board.plusOne", { name })}
            accent={accent.tint}
            pressed={pressed === "plus"}
            onPressChange={(on) => setPressed(on ? "plus" : null)}
            onCommit={() => onLife(1)}
          />

          {/* El número, en Geist Mono: tabular por construcción, así que al bajar de
              10 a 9 no se descoloca. No intercepta el toque — la mitad de debajo sí. */}
          <div className="pointer-events-none relative flex flex-1 items-center justify-center">
            <span
              aria-label={t("board.life", { name })}
              className="select-none font-mono font-medium tabular-nums leading-none"
              style={{ fontSize, letterSpacing: "-0.045em" }}
            >
              {life}
            </span>
          </div>

          {children}

          {/* Eliminado: atenuado y VISIBLE. Esconderlo perdería la mesa de vista. */}
          {player.elimination && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/65">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("board.eliminated")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Media cara táctil. Va por debajo de la cabecera y de la botonera en el z-index
 * (ellas se pintan después), así que tocar el nombre abre la hoja y no suma vida.
 */
function LifeHalf({
  side,
  label,
  accent,
  pressed,
  onPressChange,
  onCommit,
}: {
  side: "left" | "right";
  label: string;
  accent: string;
  pressed: boolean;
  onPressChange: (pressed: boolean) => void;
  onCommit: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onCommit}
      onPointerDown={() => onPressChange(true)}
      onPointerUp={() => onPressChange(false)}
      onPointerLeave={() => onPressChange(false)}
      onBlur={() => onPressChange(false)}
      className={`absolute bottom-0 top-7 w-1/2 transition-colors ${
        side === "left" ? "left-0" : "right-0"
      } ${pressed ? accent : "bg-transparent"}`}
    >
      {/* En reposo, un signo muy tenue; al pulsar, la mitad se tiñe del color del
          asiento y el signo se convierte en el delta. */}
      <span
        aria-hidden
        className={`absolute top-1/2 -translate-y-1/2 font-mono tabular-nums transition-all ${
          pressed ? "text-[17px] opacity-90" : "text-[15px] opacity-35"
        } ${side === "left" ? "left-3" : "right-3"}`}
      >
        {pressed ? (side === "left" ? "−1" : "+1") : side === "left" ? "−" : "+"}
      </span>
    </button>
  );
}
