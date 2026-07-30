"use client";

import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

const STATUS_ORDER: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

// Las películas se registran de un gesto: o están pendientes o vistas — no hay
// "en curso" ni "abandonado" (una peli se ve de una sentada, ver §7.14 y la
// decisión de forma en docs/requirements/decisiones.md). Solo dos pastillas.
const MOVIE_STATUS_ORDER: MediaStatus[] = ["planned", "completed"];

const STATUS_DOT_CLASSES: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

// El verbo de "en curso"/"completado" cambia por tipo de medio (Leyendo/
// Viendo, Leído/Vista, ver mockup .seg en "Paper - Ficha de título
// completa", pantalla 3); pendiente y dejado no varían, así que reutilizan
// las claves genéricas que ya pinta status-badge.tsx (library.status.*).
const VERB_KEY: Partial<Record<MediaStatus, "inProgress" | "completed">> = {
  in_progress: "inProgress",
  completed: "completed",
};

// Segmented control de estado para la pestaña Registro (mockup .seg): cuatro
// pastillas con un punto de color, la activa resaltada con fondo y sombra
// suave. Control "tonto": el padre decide qué hacer con el cambio (llamar a
// updateStatus, abrir la hoja de cierre de pase si toca...) y nos pasa
// `disabled` mientras esa acción está en curso.
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

  // Películas: dos pastillas. Si un pase heredado quedó "en curso"/"abandonado"
  // (posible antes de este cambio), añadimos su pastilla al final para no dejar
  // el control sin selección — al mover a Pendiente/Vista vuelve a las dos.
  const order =
    itemType === "movie"
      ? MOVIE_STATUS_ORDER.includes(status)
        ? MOVIE_STATUS_ORDER
        : [...MOVIE_STATUS_ORDER, status]
      : STATUS_ORDER;

  return (
    <div
      role="group"
      aria-label={tSegments("groupLabel")}
      className="flex gap-1.5 rounded-[10px] bg-surface-muted p-1"
    >
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
              if (!isActive) onChange(option);
            }}
            className={`flex flex-1 flex-col items-center gap-1 rounded-[7px] px-1 py-2 text-center text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isActive
                ? "bg-surface text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[option]}`}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
