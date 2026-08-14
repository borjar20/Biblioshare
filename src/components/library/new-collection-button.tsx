"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createCollection } from "@/lib/library/collection-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

// «＋ Nueva colección». Era el último TILE del grid (Task 5, S1); ahora es un
// botón de la cabecera: con la rejilla ensanchada a tres columnas, un recuadro
// punteado del tamaño de una tarjeta competía en peso visual con las
// colecciones de verdad, y su sitio bailaba según cuántas hubiera. La hoja no
// cambia — mismo `<dialog>` nativo que el resto de hojas del proyecto (foco
// atrapado, Escape/clic-fuera cierran gratis) y misma acción. Al crear, entra
// directo al detalle recién nacido.
//
// `variant`: en la cabecera es el botón principal; dentro del estado vacío
// (cuando no hay ninguna colección) lo pinta el propio EmptyState como acción.
export function NewCollectionButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
}) {
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
      <Button type="button" variant={variant} onClick={openSheet}>
        <span aria-hidden>＋</span>
        {t("newCollection")}
      </Button>

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
