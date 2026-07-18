"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import {
  createCollection,
  getCollectionsForSheet,
  setItemCollections,
  type SheetCollection,
} from "@/lib/library/collection-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Hoja «Añadir a colección» (frame D, Colección v2 S2): reutilizable desde la
// ficha del ítem (log-panel.tsx) y desde la tarjeta del grid
// (library-item-card.tsx). El disparador se pasa como render-prop
// (`renderTrigger`) porque los dos sitios lo pintan MUY distinto (botón de
// acción del rail vs. enlace pequeño junto a "Fijar en el perfil"); el
// `<dialog>`, la carga de datos y el "Hecho" son idénticos en los dos y viven
// aquí una sola vez.
//
// Los datos (colecciones + cuáles ya contienen el ítem) se piden al ABRIR, no
// se precargan desde el server component de la ficha/grid: son irrelevantes
// si el usuario nunca abre la hoja, y así un mismo componente cliente sirve a
// un disparador que cuelga de un server component (la ficha) y a otro que ya
// es cliente (LibraryItemCard) sin duplicar el fetch en cada page.tsx.
export function AddToCollectionSheet({
  itemType,
  itemId,
  renderTrigger,
}: {
  itemType: ItemType;
  itemId: string;
  renderTrigger: (open: () => void) => ReactNode;
}) {
  const t = useTranslations("collection");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<SheetCollection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openSheet() {
    setError(null);
    setCreating(false);
    setNewName("");
    setOpen(true);
    setLoading(true);
    startTransition(async () => {
      const result = await getCollectionsForSheet(itemType, itemId);
      setLoading(false);
      if ("error" in result) {
        setError(t(`errors.${result.error}`));
        // Un fallo de carga NO es «0 colecciones»: dejar `collections` en null
        // mantiene «Hecho» deshabilitado (evita que un `setItemCollections([])`
        // borre el ítem de TODAS sus colecciones) y no pinta el estado vacío.
        setCollections(null);
        return;
      }
      setCollections(result.collections);
    });
  }

  function toggle(id: string) {
    setCollections((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)) : prev,
    );
  }

  function submitNewCollection() {
    setError(null);
    startTransition(async () => {
      const result = await createCollection(newName);
      if ("error" in result) {
        setError(t(`errors.${result.error}`));
        return;
      }
      // Ya marcada: es justo lo que se acaba de pedir crear.
      setCollections((prev) => [
        ...(prev ?? []),
        {
          id: result.id,
          name: newName.trim(),
          count: 0,
          fanCovers: [],
          dominantType: null,
          checked: true,
        },
      ]);
      setCreating(false);
      setNewName("");
    });
  }

  function done() {
    if (!collections) {
      dialogRef.current?.close();
      return;
    }
    const selected = collections.filter((c) => c.checked).map((c) => c.id);
    setError(null);
    startTransition(async () => {
      const result = await setItemCollections(itemType, itemId, selected);
      if (result.error) {
        setError(t(`errors.${result.error}`));
        return;
      }
      dialogRef.current?.close();
    });
  }

  const markedCount = collections?.filter((c) => c.checked).length ?? 0;

  return (
    <>
      {renderTrigger(openSheet)}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="add-to-collection-title"
        className="m-auto flex max-h-[85vh] w-[min(420px,92vw)] flex-col rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="border-b border-border px-5 py-4">
            <h2 id="add-to-collection-title" className="font-serif text-lg font-semibold">
              {t("addSheet.title")}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {t("addSheet.markedCount", { count: markedCount })}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {loading && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("addSheet.loading")}
              </p>
            )}
            {!loading && collections && collections.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("addSheet.empty")}
              </p>
            )}
            {!loading && collections && collections.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {collections.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={c.checked}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 shrink-0 rounded border-border accent-accent"
                      />
                      <MiniCover cover={c.fanCovers[0] ?? null} name={c.name} accentType={c.dominantType} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {t("titleCount", { count: c.count })}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-5 py-3">
            {creating ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitNewCollection();
                }}
              >
                <Input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={t("newCollectionNameLabel")}
                  maxLength={80}
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" disabled={isPending || !newName.trim()}>
                  {t("create")}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={loading}
                className="text-sm font-medium text-accent hover:underline disabled:opacity-60"
              >
                {t("addSheet.createNew")}
              </button>
            )}
            {error && <p className="mt-2 text-xs text-status-dropped">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              {t("cancel")}
            </Button>
            <Button type="button" disabled={isPending || loading || !collections} onClick={done}>
              {isPending ? t("addSheet.saving") : t("addSheet.done")}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function MiniCover({
  cover,
  name,
  accentType,
}: {
  cover: string | null;
  name: string;
  accentType: ItemType | null;
}) {
  const dotClass = accentType ? MEDIA_ACCENT[accentType].bg : "bg-muted-foreground";
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[6px] border border-border bg-surface-muted">
      {cover ? (
        <Image src={cover} alt="" fill sizes="36px" className="object-cover" />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center text-[11px] font-semibold text-white ${dotClass}`}
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
    </div>
  );
}
