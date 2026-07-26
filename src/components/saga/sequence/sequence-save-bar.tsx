"use client";

import { useTranslations } from "next-intl";
import type { SaveStatus } from "./use-sequence-draft";

/** Frame C3, menos su cuarto estado. La maqueta dibuja un error bloqueante
 *  («en la secuencia sin número») que con el número derivado de la posición es
 *  INALCANZABLE desde la interfaz (spec §«El número no se teclea»), así que no
 *  se construye esa cara: la validación sigue viva en el servidor y en el CHECK,
 *  que es donde protege. Sí se pinta el fallo de guardado, que sí puede pasar. */
export function SequenceSaveBar({
  status, unclassified, error, onSave,
}: {
  status: SaveStatus;
  unclassified: number;
  error: string | null;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-border bg-surface/95 px-3.5 py-2.5 backdrop-blur lg:px-6">
      {unclassified > 0 && (
        <p className="flex gap-2 rounded-lg border border-gold/40 bg-gold/[0.12] px-2.5 py-2 text-[11.5px] leading-snug text-gold-ink">
          <span aria-hidden>◭</span>
          {t("unclassifiedWarning", { count: unclassified })}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-status-dropped/50 px-2.5 py-2 text-[11.5px] text-status-dropped">
          {t(`sequenceErrors.${error}`)}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <b className="block text-[12px]">
            {status === "saving" ? t("savingSequence") : status === "saved" ? t("saved") : status === "dirty" ? t("saveDirtyShort") : t("saveNoChanges")}
          </b>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            {status === "saving" ? t("savingHint") : t("saveAtomic")}
          </span>
        </div>
        {/* Deshabilitado en "saving" evita un segundo guardado concurrente
         *  mientras el primero está en vuelo — el hook no lo hace por diseño
         *  (es responsabilidad de la presentación). También en "idle": no hay
         *  nada que guardar antes de la primera interacción. */}
        <button
          type="button" onClick={onSave} disabled={status === "saving" || status === "idle"}
          className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {t("saveSequence")}
        </button>
      </div>
    </div>
  );
}
