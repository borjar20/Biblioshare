"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createCollection } from "@/lib/library/collection-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

// Tile «＋ Nueva colección», último del grid (Task 5, S1). Hoja mínima con un
// solo campo (nombre) — mismo `<dialog>` nativo que el resto de hojas del
// proyecto (foco atrapado, Escape/clic-fuera cierran gratis). Al crear, entra
// directo al detalle recién nacido.
export function NewCollectionTile() {
  const t = useTranslations("collection");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openSheet() {
    setName("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCollection(name);
      if ("error" in result) {
        setError(t(`errors.${result.error}`));
        return;
      }
      dialogRef.current?.close();
      router.push(`/coleccion/c/${result.id}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="flex h-full min-h-[172px] flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
      >
        <span aria-hidden className="text-xl leading-none">
          ＋
        </span>
        {t("newCollection")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="new-collection-title"
        className="m-auto w-[min(380px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="border-b border-border px-5 py-4">
            <h2
              id="new-collection-title"
              className="font-serif text-lg font-semibold"
            >
              {t("newCollection")}
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-5 py-4">
            <Field label={t("newCollectionNameLabel")} htmlFor="new-collection-name">
              <Input
                id="new-collection-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                maxLength={80}
              />
            </Field>
            {error && <p className="text-xs text-status-dropped">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? t("creating") : t("create")}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
