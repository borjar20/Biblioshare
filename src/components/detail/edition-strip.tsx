"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import { formatEdition, formatEditionMeta } from "@/lib/editions/edition-label";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { createEdition, type CreateEditionState } from "@/lib/editions/actions";
import {
  deleteEdition,
  type DeleteEditionState,
} from "@/lib/catalog/edit-actions";
import { EditionFields } from "./edition-fields";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";

const initialState: CreateEditionState = {};

// Cuántas ediciones se enseñan de primeras en PC. La maqueta dibuja 4 y el
// tile de añadir (dos filas de la rejilla de 3), pero un libro real trae hasta
// 18 tras sincronizar con OpenLibrary y la rejilla se comía la pantalla.
const PC_PREVIEW = 5;

// Horizontal edition/version rail for the detail "Info" tab (same family as
// SagaStrip): cada tarjeta muestra la etiqueta, el nombre y el resumen de
// formatEdition; la del pase abierto (selectedEditionId, Tarea 12) lleva ✓ y
// el acento de tipo de medio. El alta inline solo se pinta a colaborador+.
//
// selectedEditionId (✓ + "La tuya") es la edición del PASE — solo cambia
// desde el Registro. Las tarjetas NO son pulsables: cada una ya enseña sus
// datos (etiqueta, editorial, año, páginas, ISBN), que es justo lo que hace
// la maqueta (.edn). Hubo un panel que cambiaba a los datos de la edición
// pulsada; se quitó porque repetía lo que la tarjeta ya dice y no existía en
// ningún frame.
export function EditionStrip({
  itemType,
  itemId,
  editions,
  selectedEditionId,
  usedEditionIds,
  canContribute,
}: {
  itemType: ItemType;
  itemId: string;
  editions: Edition[];
  /** La edición del pase abierto del que mira, si tiene. */
  selectedEditionId: string | null;
  /** Ediciones con pases registrados: no se ofrece borrarlas. */
  usedEditionIds: string[];
  canContribute: boolean;
}) {
  const t = useTranslations("editions");
  const accent = MEDIA_ACCENT[itemType];
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(
    createEdition.bind(null, itemType, itemId),
    initialState,
  );

  // Cerrar el panel de alta tras un envío correcto es un ajuste de estado en
  // respuesta a un cambio de estado, no un efecto secundario: se hace durante
  // el render (patrón ya usado en item-picker.tsx) en vez de en un
  // useEffect, que aquí dispararía la regla de lint
  // react-hooks/set-state-in-effect y además tardaría un ciclo extra en
  // reflejarse (flash del formulario ya vacío antes de cerrarse).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (!state.error) setAdding(false);
  }

  // La tuya primero. Antes se dejaban en el orden que vinieran y se centraba
  // la tarjeta del pase con un scrollIntoView al montar; ordenar es más
  // simple y sirve a las dos vistas — en la tira no hay que buscarla, y en la
  // rejilla de PC entra en el primer corte aunque la obra tenga 18 ediciones.
  const ordered = selectedEditionId
    ? [...editions].sort((a, b) =>
        a.id === selectedEditionId ? -1 : b.id === selectedEditionId ? 1 : 0,
      )
    : editions;

  const [expanded, setExpanded] = useState(false);
  const hasMore = ordered.length > PC_PREVIEW;

  // Borrado rápido (colaborador+): un único <dialog> reutilizado, con la
  // edición pendiente en estado. Mismo patrón que hero-menu.tsx — el <dialog>
  // nativo ya da foco, Escape y cierre por clic fuera.
  const used = new Set(usedEditionIds);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingDelete, setPendingDelete] = useState<Edition | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteEditionState>({});
  const [deletePending, startDeleteTransition] = useTransition();

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (pendingDelete && !dialog.open) dialog.showModal();
    if (!pendingDelete && dialog.open) dialog.close();
  }, [pendingDelete]);

  function askDelete(edition: Edition) {
    // El error de un intento anterior no puede sobrevivir a abrir otra
    // edición: diría "en uso" de algo que sí se puede borrar.
    setDeleteState({});
    setPendingDelete(edition);
  }

  function confirmDelete() {
    const edition = pendingDelete;
    if (!edition) return;
    startDeleteTransition(async () => {
      const result = await deleteEdition(edition.id, itemType, itemId);
      setDeleteState(result);
      // Con error el diálogo SE QUEDA abierto: `inUse` es información útil
      // (hay pases contra esa edición), no un fallo que esconder.
      if (result.ok) setPendingDelete(null);
    });
  }

  if (editions.length === 0 && !canContribute) return null;

  const isMovie = itemType === "movie";

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[10px] tracking-wider ${accent.text} uppercase`}
        >
          {isMovie ? t("titleMovie") : t("titleBook")}
        </span>
        {editions.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("count", { count: editions.length })}
          </span>
        )}
      </div>

      {/* Móvil: tira con scroll (.eds-row). PC: rejilla de 3 ya desplegada
          (.eds-grid) — en el ancho hay sitio y no hace falta recortar. */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:pb-0">
        {ordered.map((edition, index) => {
          const isSelected = edition.id === selectedEditionId;
          // El recorte es SOLO de PC: en móvil la tira ya scrollea, que es su
          // forma natural de "ver todas". Por eso se esconde con `lg:hidden`
          // en vez de cortar el array — así el móvil no se entera.
          const hiddenOnPc = !expanded && index >= PC_PREVIEW;
          // Solo pintamos el nombre en semibold si aporta algo distinto de la
          // etiqueta de arriba: en película publisher siempre es null, así
          // que sin este guard el nombre repetía la misma etiqueta dos veces.
          const name =
            edition.publisher && edition.publisher !== edition.label
              ? edition.publisher
              : null;
          // En película la línea de metadatos usa año y duración (sin
          // repetir la etiqueta, que formatEdition antepone); en libro se
          // mantiene el resumen completo etiqueta · editorial · páginas.
          const meta = isMovie
            ? formatEditionMeta(edition)
            : formatEdition(edition, itemType);

          return (
            <div
              key={edition.id}
              // Las tarjetas dejaron de ser botones al quitar la mirada de
              // edición: sin aria-pressed que las distinga del "+ Añadir",
              // el e2e necesita un asidero propio.
              data-testid="edition-card"
              className={`relative w-[150px] shrink-0 rounded-lg border bg-surface p-3 text-left lg:w-auto lg:shrink ${
                isSelected ? accent.border : "border-border"
              } ${hiddenOnPc ? "lg:hidden" : ""}`}
            >
              {isSelected && (
                <span
                  className={`absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center ${accent.text}`}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              )}
              {/* El menú no compite con el ✓ por la esquina: la edición marcada
                  como «La tuya» es la del pase abierto de quien mira, así que
                  siempre está en uso y nunca ofrece borrado.

                  Antes esto era una × de borrado SIEMPRE VISIBLE en cada
                  tarjeta, para cualquier colaborador — y lo que borra no es un
                  dato propio, es una edición del catálogo COMÚN (F3-012). Ahora
                  vive tras el «···»; la hoja de confirmación de dos pasos que ya
                  existía (askDelete) no cambia. */}
              {canContribute && !used.has(edition.id) && (
                <div className="absolute top-1.5 right-1.5">
                  <ActionMenu
                    label={t("actionsLabel", { label: edition.label })}
                    triggerTestId="edition-actions"
                    items={[
                      {
                        key: "delete",
                        label: t("delete", { label: edition.label }),
                        danger: true,
                        testId: "delete-edition",
                        onSelect: () => askDelete(edition),
                      },
                    ]}
                    triggerClassName="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  />
                </div>
              )}
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase ${
                    isSelected
                      ? `${accent.bg} text-accent-foreground`
                      : "bg-surface-muted text-muted-foreground"
                  }`}
                >
                  {edition.label}
                </span>
                {isSelected && (
                  <span className={`font-mono text-[9px] ${accent.text}`}>
                    {t("yours")}
                  </span>
                )}
              </div>
              {name && (
                <p className="line-clamp-2 text-xs font-semibold text-foreground">
                  {name}
                </p>
              )}
              {meta && (
                <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-muted-foreground">
                  {meta}
                </p>
              )}
            </div>
          );
        })}

        {canContribute && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className={`flex w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 text-center font-mono text-[11px] font-medium ${accent.border} ${accent.text}`}
          >
            <PlusIcon className="h-4 w-4" />
            {isMovie ? t("addMovie") : t("add")}
          </button>
        )}
      </div>

      {/* Solo PC: en móvil la tira scrollea y no hay nada que desplegar. */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="hidden self-start font-mono text-[10px] text-muted-foreground underline transition-colors hover:text-foreground lg:block"
        >
          {expanded ? t("showLess") : t("showAll", { count: ordered.length })}
        </button>
      )}

      {canContribute && adding && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card"
        >
          <EditionFields isMovie={isMovie} />

          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            className="self-start"
          >
            {pending ? t("submitting") : t("submit")}
          </Button>

          {state.error && (
            <p className="text-sm text-status-dropped">
              {t(`errors.${state.error}`)}
            </p>
          )}
        </form>
      )}

      <dialog
        ref={deleteDialogRef}
        data-testid="delete-edition-dialog"
        onClose={() => setPendingDelete(null)}
        aria-label={t("confirmTitle")}
        className="m-auto w-[min(360px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === deleteDialogRef.current) setPendingDelete(null);
        }}
      >
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm font-semibold">{t("confirmTitle")}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase">
              {pendingDelete?.label}
            </span>
            {" — "}
            {t("confirmBody")}
          </p>

          {deleteState.error && (
            <p className="text-sm text-status-dropped">
              {t(
                deleteState.error === "inUse"
                  ? "errors.inUse"
                  : deleteState.error === "forbidden"
                    ? "errors.deleteForbidden"
                    : "errors.deleteFailed",
              )}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingDelete(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={deletePending}
              onClick={confirmDelete}
              className="text-status-dropped"
            >
              {deletePending ? t("deleting") : t("confirmDelete")}
            </Button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
