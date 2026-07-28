"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT, isSagaAccentToken } from "@/lib/sagas/accents";
import type { DraftEntry } from "@/lib/sagas/sequence-draft";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";

// La lista viene de `roles.ts`: era una de las tres copias del mismo
// vocabulario que la fase 5 unificó.
const ROLES = SAGA_ITEM_ROLES;

/** Fila de obra y de bloque-subsaga. Presentación pura: recibe la entrada y
 *  callbacks, no toca el borrador. `density` es lo único que cambia entre las
 *  dos cáscaras — en escritorio los controles van en línea, en móvil el número
 *  y la portada son mayores y el resto vive en la hoja. */
export function SequenceRow({
  entry, slotNumber, density, onOptional, onRole, onMenu, controls,
}: {
  entry: DraftEntry;
  /** Número del hueco, o null fuera de la secuencia. Lo calcula quien pinta la
   *  zona: la fila NO lo deriva ni lo deja teclear. */
  slotNumber: number | null;
  density: "compact" | "roomy";
  onOptional: (v: boolean) => void;
  onRole: (r: SagaItemRole | null) => void;
  onMenu: () => void;
  /** ↑ ↓ y el asa, que solo existen dentro de la secuencia. */
  controls?: React.ReactNode;
}) {
  const t = useTranslations("sagaEditor");
  const isBlock = entry.kind === "block";
  const accent = isSagaAccentToken(entry.accentColor) ? SAGA_ACCENT[entry.accentColor] : null;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border border-border bg-surface py-2 pl-1.5 pr-2.5 ${
        isBlock && accent ? `border-l-[3px] ${accent.border}` : ""
      }`}
      data-testid="sequence-row"
      data-key={entry.key}
    >
      <span
        className={`w-6 shrink-0 text-center font-mono text-[15px] font-medium ${
          slotNumber === null ? "text-[13px] text-foreground-faint" : "text-accent"
        }`}
      >
        {slotNumber ?? "·"}
      </span>

      {isBlock ? (
        <span className={`grid h-12 w-8 shrink-0 place-items-center rounded ${accent?.bg ?? "bg-surface-muted"} text-[13px]`} aria-hidden />
      ) : entry.coverUrl ? (
        <Image src={entry.coverUrl} alt="" width={32} height={47} className="h-[47px] w-8 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-[47px] w-8 shrink-0 rounded bg-surface-muted" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[13.5px] font-semibold leading-tight">{entry.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {isBlock ? (
            <span className="font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
              {t("blockMeta", { count: entry.count ?? 0 })}
            </span>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {t(`itemType.${entry.itemType}`)}
            </span>
          )}
          {entry.optional && (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
              {t("optionalChip")}
            </span>
          )}
        </div>
      </div>

      {density === "compact" && (
        <>
          <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={entry.optional}
              onChange={(e) => onOptional(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("optionalChip")}
          </label>
          {!isBlock && (
            <select
              value={entry.role ?? ""}
              onChange={(e) => onRole((e.target.value || null) as SagaItemRole | null)}
              aria-label={t("roleLabelFor", { title: entry.title })}
              className="w-[150px] shrink-0 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-[11.5px]"
            >
              <option value="">{t("roleNone")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{t(`role.${r}`)}</option>
              ))}
            </select>
          )}
        </>
      )}

      {/* Esta pantalla solo cura las filas de SU saga (#187 deliberado): un
       *  bloque es una subsaga entera, y sus propias filas viven detrás de este
       *  enlace, nunca aquí. Sin él, curar una hija sería inalcanzable desde el
       *  padre — la misma trampa que #181 un nivel más abajo. */}
      {isBlock && entry.childSagaId && (
        <Link
          href={`/saga/${entry.childSagaId}/editar`}
          aria-label={t("blockOpenEditorFor", { title: entry.title })}
          className="shrink-0 rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-surface-muted"
        >
          {t("blockOpenEditor")}
        </Link>
      )}

      {controls}

      <button
        type="button"
        onClick={onMenu}
        aria-label={t("rowMenuFor", { title: entry.title })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-foreground-faint hover:bg-surface-muted"
      >
        ⋯
      </button>
    </div>
  );
}
