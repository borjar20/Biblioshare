"use client";

import { useTranslations } from "next-intl";
import { DROPPED_REASONS, type DroppedReason } from "@/lib/passes/types";

const SIZES = {
  default: { pill: "px-2.5 py-1 text-xs", textarea: "px-3 py-2 text-sm", rows: 2 },
  sm: { pill: "px-2 py-0.5 text-[11px]", textarea: "px-2 py-1.5 text-xs", rows: 2 },
} as const;

// Motivo de abandono: SIEMPRE privado (ver la máscara de pass_reviews,
// migración 20260858). Compartido por ClosePassSheet (al marcar "dropped") y
// PassDiary (al editar un pase ya cerrado como "dropped"). Radios nativos —
// name="droppedReason" — para que closePass/updatePass los lean con
// formData.get("droppedReason") sin inputs ocultos; el textarea de "otro"
// solo se monta cuando esa es la categoría elegida, así que un pase que NO
// eligió "otro" ni siquiera manda droppedReasonNote en el submit.
export function DroppedReasonFields({
  reason,
  onReasonChange,
  note,
  onNoteChange,
  size = "default",
}: {
  reason: DroppedReason | "";
  onReasonChange: (next: DroppedReason) => void;
  note: string;
  onNoteChange: (next: string) => void;
  size?: "default" | "sm";
}) {
  const t = useTranslations("passes.droppedReason");
  const s = SIZES[size];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-section">{t("label")}</span>
      <div className="flex flex-wrap gap-1.5">
        {DROPPED_REASONS.map((value) => (
          <label
            key={value}
            className={`cursor-pointer rounded-full border font-medium transition-colors ${s.pill} ${
              reason === value
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              name="droppedReason"
              value={value}
              checked={reason === value}
              onChange={() => onReasonChange(value)}
              className="sr-only"
            />
            {t(`options.${value}`)}
          </label>
        ))}
      </div>

      {reason === "otro" && (
        <textarea
          name="droppedReasonNote"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("notePlaceholder")}
          rows={s.rows}
          className={`w-full resize-none rounded-md border border-border bg-surface-muted text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${s.textarea}`}
        />
      )}
    </div>
  );
}
