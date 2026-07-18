"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  renameCollection,
  updateCollectionDescription,
  deleteCollection,
} from "@/lib/library/collection-actions";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PencilIcon, NoteIcon, XIcon } from "@/components/ui/icons";

type Mode = "rename" | "description" | null;

// Menú «⋯» del topbar del detalle (Colección v2, Sesión 2): renombrar, editar
// descripción y borrar. Un solo `<dialog>` cuyo contenido cambia según `mode`
// (renombrar/descripción comparten forma — un campo, Guardar/Cancelar — no
// merece dos `<dialog>` separados); Borrar no abre hoja, usa `confirm()`
// nativo como `club-post-card.tsx` (acción de una sola pregunta, no hace
// falta un formulario).
//
// Tras renombrar/editar, `router.refresh()`: las server actions ya hacen
// `revalidatePath`, pero el nombre en el topbar y la descripción bajo el
// abanico viven en el server component (`page.tsx`/`CollectionDetail`) —
// hace falta re-pedir esos server components, no solo invalidar la caché.
export function CollectionMenu({
  collectionId,
  name,
  description,
}: {
  collectionId: string;
  name: string;
  description: string | null;
}) {
  const t = useTranslations("collection");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [nameValue, setNameValue] = useState(name);
  const [descValue, setDescValue] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mode && !dialog.open) dialog.showModal();
    if (!mode && dialog.open) dialog.close();
  }, [mode]);

  function close() {
    dialogRef.current?.close();
  }

  function openRename() {
    setNameValue(name);
    setError(null);
    setMode("rename");
  }

  function openDescription() {
    setDescValue(description ?? "");
    setError(null);
    setMode("description");
  }

  function submitRename() {
    setError(null);
    startTransition(async () => {
      const result = await renameCollection(collectionId, nameValue);
      if (result.error) {
        setError(t(`errors.${result.error}`));
        return;
      }
      close();
      router.refresh();
    });
  }

  function submitDescription() {
    setError(null);
    startTransition(async () => {
      const result = await updateCollectionDescription(collectionId, descValue);
      if (result.error) {
        setError(t(`errors.${result.error}`));
        return;
      }
      close();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteCollection(collectionId);
      if (result.error) {
        // Sin hoja abierta donde mostrarlo: la única acción que puede fallar
        // sin haber abierto un `<dialog>` antes, así que va a un alert() —
        // igual de discreto que el resto del proyecto para estos casos raros.
        alert(t(`errors.${result.error}`));
        return;
      }
      router.push("/coleccion");
    });
  }

  return (
    <>
      <ActionMenu
        label={t("menuLabel")}
        triggerClassName="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
        items={[
          {
            key: "rename",
            label: t("rename"),
            icon: <PencilIcon className="h-4 w-4" />,
            onSelect: openRename,
          },
          {
            key: "description",
            label: t("editDescription"),
            icon: <NoteIcon className="h-4 w-4" />,
            onSelect: openDescription,
          },
          {
            key: "delete",
            label: t("delete"),
            icon: <XIcon className="h-4 w-4" />,
            onSelect: handleDelete,
            disabled: isPending,
            danger: true,
          },
        ]}
      />

      <dialog
        ref={dialogRef}
        onClose={() => setMode(null)}
        aria-labelledby="collection-menu-dialog-title"
        className="m-auto w-[min(380px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        {mode === "rename" && (
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              submitRename();
            }}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 id="collection-menu-dialog-title" className="font-serif text-lg font-semibold">
                {t("rename")}
              </h2>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
              <Field label={t("newCollectionNameLabel")} htmlFor="collection-rename-name">
                <Input
                  id="collection-rename-name"
                  value={nameValue}
                  onChange={(event) => setNameValue(event.target.value)}
                  autoFocus
                  maxLength={80}
                />
              </Field>
              {error && <p className="text-xs text-status-dropped">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="secondary" disabled={isPending} onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isPending || !nameValue.trim()}>
                {isPending ? t("saving") : t("save")}
              </Button>
            </div>
          </form>
        )}

        {mode === "description" && (
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              submitDescription();
            }}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 id="collection-menu-dialog-title" className="font-serif text-lg font-semibold">
                {t("editDescription")}
              </h2>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
              <Field label={t("descriptionLabel")} htmlFor="collection-description">
                <textarea
                  id="collection-description"
                  rows={4}
                  value={descValue}
                  onChange={(event) => setDescValue(event.target.value)}
                  maxLength={500}
                  autoFocus
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </Field>
              {error && <p className="text-xs text-status-dropped">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="secondary" disabled={isPending} onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("saving") : t("save")}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
