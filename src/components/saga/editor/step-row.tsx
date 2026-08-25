"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";

// CHECK de BD (20260723_saga_routes.sql): char_length(note) <= 200. Se
// respeta aquí con maxLength para que el curador vea el límite en el input
// en vez de descubrirlo con un error de guardado.
const NOTE_MAX_LENGTH = 200;

/** Una fila del editor de pasos: ítem (portada, tipo, rol) o bloque-subsaga
 *  (barra de acento, recuento). La nota es un «+ Nota» que solo ocupa sitio
 *  cuando existe o se está escribiendo — el diseño anterior mostraba un
 *  input vacío bajo CADA paso, casi siempre sin usar. */
export function StepRow({
  item,
  index,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onNoteChange,
}: {
  item: RouteEditorItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onNoteChange: (note: string | null) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [noteOpen, setNoteOpen] = useState(item.entry.note !== null);
  const isBlock = item.entry.childSagaId !== null;
  const accent = item.accent ? SAGA_ACCENT[item.accent] : null;

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>

        {isBlock ? (
          <span className={`h-8 w-1 shrink-0 rounded-full ${accent?.tick ?? "bg-surface-muted"}`} aria-hidden />
        ) : item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt=""
            width={26}
            height={38}
            className="h-[38px] w-[26px] shrink-0 rounded object-cover"
          />
        ) : (
          <span className="h-[38px] w-[26px] shrink-0 rounded bg-surface-muted" aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{item.label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {isBlock ? (
              <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {t("routeStepBlockMeta", { count: item.memberCount ?? 0 })}
              </span>
            ) : (
              <>
                {item.itemType && (
                  <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                    {t(`itemType.${item.itemType}`)}
                  </span>
                )}
                {item.role && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
                    {t(`role.${item.role}`)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={t("routeStepUp")}
            className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={t("routeStepDown")}
            className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("routeStepRemove")}
          className="shrink-0 px-1.5 text-xs text-status-dropped"
        >
          ✕
        </button>
      </div>

      {noteOpen ? (
        <div className="ml-8 rounded-lg border border-border bg-surface-muted px-2.5 py-2">
          <textarea
            value={item.entry.note ?? ""}
            onChange={(e) => onNoteChange(e.target.value === "" ? null : e.target.value)}
            onBlur={() => {
              if (item.entry.note === null) setNoteOpen(false);
            }}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={t("routeStepNotePlaceholder")}
            aria-label={t("routeStepNoteLabel")}
            rows={2}
            autoFocus
            className="w-full resize-none bg-transparent text-[12px] italic leading-snug text-foreground placeholder:not-italic placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            <span>{item.entry.note ? t("routeStepNoteSaved") : t("routeStepNoteWriting")}</span>
            <b>
              {(item.entry.note ?? "").length}/{NOTE_MAX_LENGTH}
            </b>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="ml-8 self-start text-[11px] font-semibold text-muted-foreground"
        >
          + {t("routeStepAddNote")}
        </button>
      )}
    </li>
  );
}
