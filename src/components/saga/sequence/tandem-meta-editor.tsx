"use client";

import { useTranslations } from "next-intl";
import type { TandemMode } from "@/lib/sagas/types";

const MODES = [null, "simultaneo", "indistinto"] as const;

// Los dos únicos metadatos de un hueco compartido (fase 2): qué clase de tándem
// es, y por qué. Se monta SOLO bajo un hueco con dos o más obras — en uno de
// una sola no hay tándem del que hablar, y `setTandemMeta` ignoraría el cambio
// igualmente.
//
// «Sin declarar» es una opción de verdad, no un placeholder: hasta esta fase la
// interfaz afirmaba «Tándem · se leen a la vez» para TODOS los tándems, que era
// una afirmación que nadie había hecho. Poder dejarlo sin declarar es lo que
// distingue «no lo sabemos» de «da igual el orden».
export function TandemMetaEditor({
  slotNumber,
  mode,
  note,
  onChange,
}: {
  /** 1..N, solo para las etiquetas accesibles: el hueco no se identifica por su
   *  número en el estado, sino por su índice, que el llamante ya conoce. */
  slotNumber: number;
  mode: TandemMode | null;
  note: string | null;
  onChange: (meta: { mode?: TandemMode | null; note?: string | null }) => void;
}) {
  const t = useTranslations("sagaEditor");
  const label = (m: TandemMode | null) =>
    m === null ? t("tandemModeNone") : m === "simultaneo" ? t("tandemModeSimultaneo") : t("tandemModeIndistinto");

  return (
    <div data-testid="tandem-meta" className="grid gap-1.5 rounded-lg border border-dashed border-border p-2">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {t("tandemMetaTitle")}
      </span>
      <div role="group" aria-label={t("tandemMetaAria", { n: slotNumber })} className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m ?? "none"}
            type="button"
            onClick={() => onChange({ mode: m })}
            aria-pressed={mode === m}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              mode === m ? "border-accent bg-accent/10 font-semibold" : "border-border text-muted-foreground"
            }`}
          >
            {label(m)}
          </button>
        ))}
      </div>
      <input
        type="text"
        maxLength={200}
        value={note ?? ""}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder={t("tandemNotePlaceholder")}
        aria-label={t("tandemNoteAria", { n: slotNumber })}
        className="rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-[12.5px]"
      />
    </div>
  );
}
