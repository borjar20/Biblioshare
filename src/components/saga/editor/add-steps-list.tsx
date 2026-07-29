"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";

/** Normaliza para comparar sin acentos/mayúsculas — mismo criterio de fondo
 *  que `slugify` en `route-actions.ts`, pero sin colapsar a guiones: aquí
 *  solo hace falta comparar texto, no generar una URL. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function Hit({
  item,
  done,
  onAdd,
  t,
}: {
  item: RouteEditorItem;
  done: boolean;
  onAdd: (item: RouteEditorItem) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const isBlock = item.entry.childSagaId !== null;
  const accent = item.accent ? SAGA_ACCENT[item.accent] : null;

  return (
    <button
      type="button"
      onClick={() => !done && onAdd(item)}
      disabled={done}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface-muted disabled:cursor-default"
    >
      {isBlock ? (
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded ${accent?.bg ?? "bg-surface-muted"}`}
          aria-hidden
        />
      ) : item.coverUrl ? (
        <Image src={item.coverUrl} alt="" width={24} height={35} className="h-[35px] w-6 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-[35px] w-6 shrink-0 rounded bg-surface-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{item.label}</span>
        <span className="block font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
          {done
            ? t("routeAddAlreadyIn")
            : isBlock
              ? t("routeStepBlockMeta", { count: item.memberCount ?? 0 })
              : item.itemType && t(`itemType.${item.itemType}`)}
        </span>
      </span>
      <span className={`shrink-0 text-[13px] ${done ? "text-success" : "text-muted-foreground"}`} aria-hidden>
        {done ? "✓" : "+"}
      </span>
    </button>
  );
}

/** Buscador + subsagas primero, obras después, con ✓ en lo ya añadido.
 *  Filtro en cliente: la paleta (obras + subsagas del subárbol) ya viaja
 *  entera desde `page.tsx`, sin ida y vuelta al servidor. Se monta dos veces
 *  (hoja móvil, raíl de escritorio) — presentación pura, sin estado del
 *  borrador: quien lo tiene es `route-editor.tsx`. El «+» añade AL INSTANTE
 *  (no hay selección-luego-confirmar); la hoja no se cierra sola para poder
 *  seguir añadiendo. */
export function AddStepsList({
  palette,
  inDraftKeys,
  onAdd,
}: {
  palette: RouteEditorItem[];
  inDraftKeys: Set<string>;
  onAdd: (item: RouteEditorItem) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [query, setQuery] = useState("");

  const q = normalize(query.trim());
  const subsagas = palette.filter(
    (p) => p.entry.childSagaId !== null && (q === "" || normalize(p.label).includes(q)),
  );
  const items = palette.filter(
    (p) => p.entry.childSagaId === null && (q === "" || normalize(p.label).includes(q)),
  );

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-2.5 py-2">
        <span aria-hidden className="text-muted-foreground">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("routeAddSearchPlaceholder")}
          aria-label={t("routeAddSearchPlaceholder")}
          className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none"
        />
      </label>

      {subsagas.length > 0 && (
        <div>
          <h4 className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("routeAddGroupSubsagas")} <span className="text-foreground-faint">{subsagas.length}</span>
          </h4>
          <div className="grid gap-0.5">
            {subsagas.map((p) => (
              <Hit key={p.key} item={p} done={inDraftKeys.has(p.key)} onAdd={onAdd} t={t} />
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <h4 className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("routeAddGroupItems")} <span className="text-foreground-faint">{items.length}</span>
          </h4>
          <div className="grid gap-0.5">
            {items.map((p) => (
              <Hit key={p.key} item={p} done={inDraftKeys.has(p.key)} onAdd={onAdd} t={t} />
            ))}
          </div>
        </div>
      )}

      {subsagas.length === 0 && items.length === 0 && (
        <p className="py-4 text-center text-[12px] text-muted-foreground">{t("routeAddNoResults")}</p>
      )}
    </div>
  );
}
