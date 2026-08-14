"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import { searchAddableLibraryItems, addItemToCollections } from "@/lib/library/collection-actions";
import { Button } from "@/components/ui/button";
import { PlusIcon, SearchIcon, CheckIcon } from "@/components/ui/icons";

// Atajo «＋ Añadir ítems», topbar del detalle de colección: buscar en TODA la
// biblioteca del usuario y sumar títulos a ESTA colección sin salir de la
// página ni pasar por la hoja «Añadir a colección» (esa es la dirección
// contraria — de un ítem a varias colecciones, `AddToCollectionSheet`). Cada
// fila se añade con un único clic, sin checkboxes ni «Hecho»: es la acción, no
// una selección que se confirma después.
export function AddItemsToCollectionSheet({ collectionId }: { collectionId: string }) {
  const t = useTranslations("collection");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Con `query` vacía trae los últimos tocados (mismo comportamiento por
  // defecto que `getLibraryItems`): al abrir la hoja hay algo que elegir sin
  // teclear. Se repite en cada tecleo, con debounce -- son como mucho 20
  // filas, no compensa cachear resultados en cliente.
  useEffect(() => {
    if (!open) return;
    // `setLoading(true)` va DENTRO del timeout, no al inicio del efecto
    // (regla `set-state-in-effect`, mismo patrón que `ItemPicker`): así no
    // dispara un render en cascada síncrono cada vez que el efecto corre.
    const handle = setTimeout(() => {
      setLoading(true);
      searchAddableLibraryItems(collectionId, query).then((items) => {
        setResults(items);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [open, query, collectionId]);

  function openSheet() {
    setQuery("");
    setAddedKeys(new Set());
    setOpen(true);
  }

  function add(item: LibraryItem) {
    const key = `${item.itemType}:${item.itemId}`;
    setPendingKey(key);
    startTransition(async () => {
      await addItemToCollections(item.itemType, item.itemId, [collectionId]);
      setPendingKey(null);
      setAddedKeys((prev) => new Set(prev).add(key));
      // El grid de abajo (CollectionDetail, server component) tiene que
      // enterarse del alta sin cerrar la hoja: se puede seguir añadiendo.
      router.refresh();
    });
  }

  return (
    <>
      {/* Icono solo, sin etiqueta: el topbar del detalle ya reparte hueco entre
          el «‹» de vuelta, el nombre (trunca) y el menú «⋯», y el glifo del
          icono ya dice «añadir» sin repetirlo en texto. `variant="primary"`
          (acento) para que resalte frente al «⋯» secundario de al lado — es
          la acción que de verdad se usa desde aquí. */}
      <Button
        type="button"
        variant="primary"
        onClick={openSheet}
        aria-label={t("addItemsSheet.trigger")}
        className="h-[34px] w-[34px] px-0 py-0"
      >
        <PlusIcon className="h-4 w-4" />
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="add-items-title"
        // `overflow-hidden`: sin esto el propio <dialog> (no solo la lista de
        // resultados) se vuelve scrollable cuando el contenido roza `85vh`, y
        // aparecían DOS barras de scroll anidadas -- la del <dialog> y la de
        // `overflow-y-auto` de la lista, más abajo. El único scroll tiene que
        // ser el de la lista.
        className="m-auto max-h-[85vh] w-[min(420px,92vw)] overflow-hidden rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="border-b border-border px-5 py-4">
            <h2 id="add-items-title" className="font-serif text-lg font-semibold">
              {t("addItemsSheet.title")}
            </h2>
          </div>

          <div className="border-b border-border px-4 py-3">
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("addItemsSheet.searchPlaceholder")}
                className="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {loading && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("addItemsSheet.loading")}
              </p>
            )}
            {!loading && results.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("addItemsSheet.empty")}
              </p>
            )}
            {!loading && results.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {results.map((item) => {
                  const key = `${item.itemType}:${item.itemId}`;
                  const added = addedKeys.has(key);
                  return (
                    <li key={key} className="flex items-center gap-3 rounded-lg px-2 py-2">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[6px] border border-border bg-surface-muted">
                        {item.coverUrl ? (
                          <Image src={item.coverUrl} alt="" fill sizes="36px" className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-muted-foreground">
                            {item.title.trim().charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs italic text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={added || pendingKey === key}
                        onClick={() => add(item)}
                        aria-label={t("addItemsSheet.trigger")}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors disabled:opacity-60 ${
                          added
                            ? "border-green/50 bg-green/10 text-green"
                            : "border-border text-foreground hover:bg-surface-muted"
                        }`}
                      >
                        {added ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex justify-end border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={() => dialogRef.current?.close()}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
