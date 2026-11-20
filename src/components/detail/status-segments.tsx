"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import styles from "./status-segments.module.css";

const STATUS_ORDER: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

// Las películas se registran de un gesto: o están pendientes, vistas o
// abandonadas — no hay "en curso" (una peli se ve de una sentada, ver §7.14 y
// la decisión de forma en docs/requirements/decisiones.md). Tres pastillas.
const MOVIE_STATUS_ORDER: MediaStatus[] = ["planned", "completed", "dropped"];

const STATUS_DOT_CLASSES: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

// Color de texto del punto: el halo del latido usa `currentColor`.
const STATUS_TEXT_CLASSES: Record<MediaStatus, string> = {
  planned: "text-status-planned",
  in_progress: "text-status-in-progress",
  completed: "text-status-completed",
  dropped: "text-status-dropped",
};

// El verbo de "en curso"/"completado" cambia por tipo de medio (Leyendo/
// Viendo, Leído/Vista, ver mockup .seg en "Paper - Ficha de título
// completa", pantalla 3); pendiente y dejado no varían, así que reutilizan
// las claves genéricas que ya pinta status-badge.tsx (library.status.*).
const VERB_KEY: Partial<Record<MediaStatus, "inProgress" | "completed">> = {
  in_progress: "inProgress",
  completed: "completed",
};

// Segmented control de estado (mockup .seg): cuatro pastillas con un punto de
// color, la activa resaltada con fondo y sombra suave. Vive en la tarjeta del
// hero (PassCard, spec 2026-11-10-ficha-acciones), que a 360px deja ~300px
// útiles: de ahí las pastillas apretadas, para que «Abandonado» quepa sin
// desbordar. Control "tonto": el padre decide qué hacer con el cambio (vía
// usePassActions) y nos pasa `disabled` mientras esa acción está en curso.
export function StatusSegments({
  status,
  itemType,
  onChange,
  disabled = false,
}: {
  status: MediaStatus;
  itemType: ItemType;
  onChange: (next: MediaStatus) => void;
  disabled?: boolean;
}) {
  const tLibrary = useTranslations("library");
  const tSegments = useTranslations("detail.statusSegments");

  // Películas: tres pastillas. Si un pase heredado quedó "en curso" (posible antes
  // de este cambio), añadimos su pastilla al final para no dejar el control sin
  // selección — al mover a Pendiente/Vista/Abandonada vuelve a las tres.
  const order =
    itemType === "movie"
      ? MOVIE_STATUS_ORDER.includes(status)
        ? MOVIE_STATUS_ORDER
        : [...MOVIE_STATUS_ORDER, status]
      : STATUS_ORDER;

  const activeIndex = order.indexOf(status);

  // Última opción elegida AQUÍ por el usuario: su punto late una vez. No late
  // al montar ni cuando el estado llega de fuera (refresco, otra isla).
  const [beat, setBeat] = useState<MediaStatus | null>(null);

  return (
    <div
      role="group"
      aria-label={tSegments("groupLabel")}
      data-count={order.length}
      data-active-index={activeIndex}
      className="relative flex gap-1 rounded-[10px] bg-surface-muted p-1"
      style={{ "--n": order.length, "--at": activeIndex } as CSSProperties}
    >
      {/* El fondo de la activa es UN elemento que se desliza, no una clase por
          botón: así el cambio se ve como movimiento. Sin animación (movimiento
          reducido) queda colocado igual que el fondo de antes. */}
      <span
        aria-hidden="true"
        data-testid="status-thumb"
        data-disabled={disabled ? "" : undefined}
        className={`${styles.thumb} rounded-[7px] bg-surface shadow-card ${disabled ? "opacity-60" : ""}`}
      />
      {order.map((option) => {
        const isActive = option === status;
        const verbKey = VERB_KEY[option];
        const label = verbKey
          ? tSegments(`${verbKey}.${itemType}`)
          : tLibrary(`status.${option}`);

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              // Reafirmar el estado activo no debería reabrir/cerrar pases:
              // solo avisamos al padre cuando cambia de verdad.
              if (isActive) return;
              setBeat(option);
              onChange(option);
            }}
            className={`${styles.option} flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[7px] px-0.5 py-2 text-center text-[11px] leading-tight font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              data-beat={isActive && beat === option ? "" : undefined}
              className={`${styles.dot} h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[option]} ${STATUS_TEXT_CLASSES[option]}`}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
