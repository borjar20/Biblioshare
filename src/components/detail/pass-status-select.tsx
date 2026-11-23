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

// Las películas se registran de un gesto: o están pendientes, vistas o
// abandonadas — no hay "en curso" (una peli se ve de una sentada, ver §7.14 y
// la decisión de forma en docs/requirements/decisiones.md).
const MOVIE_STATUS_ORDER: MediaStatus[] = ["planned", "completed", "dropped"];

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

export function PassStatusSelect({ status, itemType, onChange, disabled = false }: {
  status: MediaStatus;
  itemType: ItemType;
  onChange: (status: MediaStatus) => void;
  disabled?: boolean;
}) {
  const tLibrary = useTranslations("library");
  const t = useTranslations("detail.statusSegments");
  const order = itemType === "movie" && status !== "in_progress" ? MOVIE_STATUS_ORDER : STATUS_ORDER;

  return (
    <label className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-surface-muted px-2.5">
      <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT_CLASSES[status]}`} />
      <select aria-label={t("groupLabel")} value={status} disabled={disabled}
        onChange={(event) => onChange(event.target.value as MediaStatus)}
        className="min-h-11 cursor-pointer bg-transparent text-sm font-medium text-foreground disabled:opacity-60">
        {order.map((option) => {
          const verb = VERB_KEY[option];
          return <option key={option} value={option} className="bg-surface text-foreground">
            {verb ? t(`${verb}.${itemType}`) : tLibrary(`status.${option}`)}
          </option>;
        })}
      </select>
    </label>
  );
}
