"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import { formatEdition, formatEditionMeta } from "@/lib/editions/edition-label";
import { sagaHref } from "@/lib/catalog/item-href";
import {
  updateCatalogItem,
  uploadCover,
  updateEdition,
  deleteEdition,
  resyncEditions,
  type EditItemState,
  type DeleteEditionState,
} from "@/lib/catalog/edit-actions";
import { createEdition, type CreateEditionState } from "@/lib/editions/actions";
import {
  assignItemToSaga,
  removeItemFromSaga,
  type AssignSagaState,
} from "@/lib/sagas/manage-saga-actions";
import { EditionFields } from "./edition-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PencilIcon, XIcon } from "@/components/ui/icons";

const initialItemState: EditItemState = {};
const initialSagaState: AssignSagaState = {};
const initialCreateState: CreateEditionState = {};

const AUTHOR_LABEL_KEY: Record<ItemType, "fieldAuthor" | "fieldDirector" | "fieldCreator"> = {
  book: "fieldAuthor",
  movie: "fieldDirector",
  series: "fieldCreator",
};

// Campos de la obra que corrige updateCatalogItem. author/synopsis/year
// llegan como null desde la BD cuando no hay dato — nunca cadena vacía, así
// que los inputs los normalizan a "" solo para el defaultValue.
export type CatalogItemFields = {
  title: string;
  author: string | null;
  synopsis: string | null;
  genres: string[];
  year: number | null;
  coverUrl: string | null;
};

const MAX_GENRES = 10;
// Espejo cliente de MAX_COVER_BYTES/ALLOWED_COVER_TYPES en edit-actions.ts:
// solo da feedback inmediato sin gastar el POST, la validación que manda de
// verdad sigue siendo la del servidor.
const MAX_COVER_CLIENT_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Contexto del botón "Editar ficha": children ahora es un ReactNode plano
// (ver comentario de CatalogEditor más abajo), así que ya no hay forma de
// pasarle el setter de `editing` como argumento de función. En su lugar,
// CatalogEditor provee este contexto y EditFichaButton (un componente
// cliente aparte) lo consume desde donde el servidor lo haya colocado dentro
// de `children` -- junto al título "Sinopsis" de InfoPanel, según el mockup.
type CatalogEditorContextValue = {
  canContribute: boolean;
  savedFlash: boolean;
  onEditClick: () => void;
};

const CatalogEditorContext = createContext<CatalogEditorContextValue | null>(null);

// Botón "Editar ficha" + aviso de "Ficha actualizada". Se coloca dentro de
// `children`, que el servidor compone y le pasa a CatalogEditor ya
// renderizado -- por eso este botón no puede recibir el setter de `editing`
// como prop y en vez de eso lo toma del contexto.
export function EditFichaButton() {
  const t = useTranslations("catalogEdit");
  const ctx = useContext(CatalogEditorContext);
  if (!ctx?.canContribute) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        className="!rounded-md !px-2 !py-1 text-xs"
        onClick={ctx.onEditClick}
      >
        <PencilIcon className="h-3.5 w-3.5" />
        {t("edit")}
      </Button>
      {ctx.savedFlash && (
        <span className="text-xs text-muted-foreground">{t("saved")}</span>
      )}
    </div>
  );
}

// Editor de la ficha oficial del catálogo (pantalla 6 del mockup Paper):
// portada, título, autoría, géneros, sinopsis, año, sagas y ediciones, todo
// editable por un colaborador+. Conmuta con la ficha de lectura normal EN LA
// MISMA página (mismo patrón que ClubForm/ClubHeader), sin ruta propia.
//
// `children` es un ReactNode YA RENDERIZADO por el servidor, nunca una
// función: una función no se puede serializar a través de la frontera
// servidor->cliente (solo las server actions pueden), así que pasarla como
// children reventaba las tres fichas con 500 en cada visita ("Functions are
// not valid as a child of Client Components"), incluso para un visitante
// anónimo. Ver EditFichaButton/CatalogEditorContext arriba para cómo el botón
// "Editar ficha" sigue pudiendo cambiar el `editing` de este componente pese
// a que el servidor solo compone ReactNodes.
export function CatalogEditor({
  itemType,
  itemId,
  item,
  editions,
  saga,
  canContribute,
  children,
}: {
  itemType: ItemType;
  itemId: string;
  item: CatalogItemFields;
  editions: Edition[];
  /** La saga asignada a este ítem, si tiene (un ítem solo puede estar en una). */
  saga: { id: string; name: string } | null;
  canContribute: boolean;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // El useActionState de "Guardar cambios" vive aquí, en CatalogEditor (quien
  // posee `editing`/`savedFlash`), y no en CatalogEditorForm: cerrar el
  // editor tras un guardado correcto es un ajuste de estado en respuesta al
  // resultado de la acción, y con el patrón prevState eso solo vale para
  // actualizar el estado PROPIO del componente que lo ejecuta. Hacerlo en
  // CatalogEditorForm para tocar el estado de su padre (vía un callback
  // onDone) es lo que React 19 avisa como inválido: "Cannot update a
  // component while rendering a different component".
  const updateAction = updateCatalogItem.bind(null, itemType, itemId);
  const [state, formAction, pending] = useActionState(updateAction, initialItemState);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok) {
      setEditing(false);
      setSavedFlash(true);
    }
  }

  const contextValue = useMemo<CatalogEditorContextValue>(
    () => ({
      canContribute,
      savedFlash,
      onEditClick: () => {
        setEditing(true);
        setSavedFlash(false);
      },
    }),
    [canContribute, savedFlash]
  );

  if (!editing || !canContribute) {
    return (
      <CatalogEditorContext.Provider value={contextValue}>
        {children}
      </CatalogEditorContext.Provider>
    );
  }

  return (
    <CatalogEditorForm
      itemType={itemType}
      itemId={itemId}
      item={item}
      editions={editions}
      saga={saga}
      state={state}
      formAction={formAction}
      pending={pending}
      onCancel={() => {
        setEditing(false);
        setSavedFlash(false);
      }}
    />
  );
}

function CatalogEditorForm({
  itemType,
  itemId,
  item,
  editions,
  saga,
  state,
  formAction,
  pending,
  onCancel,
}: {
  itemType: ItemType;
  itemId: string;
  item: CatalogItemFields;
  editions: Edition[];
  saga: { id: string; name: string } | null;
  /** useActionState de "Guardar cambios" vive en CatalogEditor (ver comentario ahí). */
  state: EditItemState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("catalogEdit");
  const tSaga = useTranslations("item.sagaForm");
  const tEditions = useTranslations("editions");
  const isMovie = itemType === "movie";

  const [genres, setGenres] = useState(item.genres);
  const [addingGenre, setAddingGenre] = useState(false);
  const [genreInput, setGenreInput] = useState("");

  function commitGenre() {
    const value = genreInput.trim();
    if (value && genres.length < MAX_GENRES && !genres.includes(value)) {
      setGenres((prev) => [...prev, value]);
    }
    setGenreInput("");
    setAddingGenre(false);
  }

  const [coverUrl, setCoverUrl] = useState(item.coverUrl);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Blob URL de la preview optimista en curso, si hay uno vivo. Se guarda en
  // un ref (no en un state) porque solo hace falta para poder revocarlo más
  // tarde -- no para pintar nada.
  const objectUrlRef = useRef<string | null>(null);

  // Revoca el blob URL pendiente al desmontar (p.ej. al cerrar el editor
  // guardando "Guardar cambios"): sin esto, cada portada subida en la sesión
  // se queda reservando memoria para siempre. No es un setState, así que no
  // cae bajo la prohibición de setState-en-efecto: es solo limpieza.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // Subida de portada: acción independiente de "Guardar cambios" (igual que
  // AvatarUpload), con preview local inmediato vía createObjectURL. La URL
  // pública real (con su parámetro de cache-busting) llega cuando Next
  // refresque los datos de servidor tras el revalidatePath de uploadCover.
  async function handleCoverChange(file: File) {
    // Validación en cliente: mismo criterio que uploadCover en
    // edit-actions.ts (MAX_COVER_BYTES/ALLOWED_COVER_TYPES), para dar
    // feedback inmediato sin gastar el POST. No sustituye la validación del
    // servidor -- esa es la que manda de verdad.
    if (!ALLOWED_COVER_TYPES.has(file.type) || file.size > MAX_COVER_CLIENT_BYTES) {
      setCoverError(true);
      return;
    }

    // Si ya había un blob URL de un intento anterior (p.ej. un reintento
    // tras un fallo), se revoca antes de crear el nuevo: si no, cada intento
    // deja un blob URL huérfano en memoria.
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;

    const previousCoverUrl = coverUrl;
    setCoverUrl(objectUrl);
    setCoverUploading(true);
    setCoverError(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadCover(itemType, itemId, formData);
      if (result.error) {
        // La subida falló: se revierte la preview optimista -- si no, el
        // colaborador ve puesta una portada nueva que nunca se llegó a
        // guardar.
        setCoverUrl(previousCoverUrl);
        setCoverError(true);
        URL.revokeObjectURL(objectUrl);
        objectUrlRef.current = null;
      }
    } catch {
      // Sin este catch, una promesa rechazada (red caída, timeout, el
      // bodySizeLimit de 5 MB de next.config.ts...) dejaba
      // setCoverUploading(false) sin ejecutarse nunca: el overlay de "…" se
      // quedaba cargando para siempre y no se avisaba de nada.
      setCoverUrl(previousCoverUrl);
      setCoverError(true);
      URL.revokeObjectURL(objectUrl);
      objectUrlRef.current = null;
    } finally {
      setCoverUploading(false);
    }
  }

  const sagaAssignAction = assignItemToSaga.bind(null, itemType, itemId);
  const [sagaState, sagaFormAction, sagaPending] = useActionState(
    sagaAssignAction,
    initialSagaState
  );

  const createEditionAction = createEdition.bind(null, itemType, itemId);
  const [createState, createFormAction, createPending] = useActionState(
    createEditionAction,
    initialCreateState
  );

  // Resincronizar ediciones (Tarea 12): solo libros, las versiones de
  // película no vienen de OpenLibrary. resyncEditions no tiene la firma
  // (prevState, formData) de una server action de formulario -- se llama
  // directamente desde una transición, igual que el borrado de edición.
  const [resyncPending, startResyncTransition] = useTransition();
  const [resyncError, setResyncError] = useState(false);

  function handleResync() {
    setResyncError(false);
    startResyncTransition(async () => {
      const result = await resyncEditions(itemId);
      if (result.error) setResyncError(true);
    });
  }

  return (
    <>
      {/* Banner ámbar pegajoso: recuerda que esto no es un borrador personal,
          es la ficha compartida por toda la comunidad. top-14 aproxima la
          altura del Header sticky (src/components/header.tsx) para no
          solaparse con él. */}
      <div className="sticky top-14 z-30 -mx-4 flex items-start gap-2.5 border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-amber-900 sm:-mx-6 sm:px-6 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
        <span aria-hidden className="text-sm leading-5">
          ✎
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{t("title")}</span>
          <span className="text-xs opacity-80">{t("subtitle")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-8 pt-5 pb-28">
        <form id="catalog-edit-form" action={formAction} className="flex flex-col gap-5">
          <div className="flex gap-4">
            <button
              type="button"
              aria-label={t("cover")}
              onClick={() => fileInputRef.current?.click()}
              className="group relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-cover border border-border bg-surface-muted"
            >
              {coverUrl ? (
                <Image
                  src={coverUrl}
                  alt=""
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                  {t("cover")}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {coverUploading ? "…" : t("changeCover")}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Se resetea el value tras leer el fichero: si no, elegir el
                // MISMO fichero dos veces seguidas (p.ej. reintentar tras un
                // fallo) no dispara este onChange la segunda vez.
                e.target.value = "";
                if (file) void handleCoverChange(file);
              }}
            />

            <label className="flex flex-1 flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {t("fieldTitle")}
              </span>
              <input
                name="title"
                defaultValue={item.title}
                required
                maxLength={300}
                className="rounded-md border border-border bg-surface px-3 py-2 font-serif text-lg text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>
          {coverError && (
            <p className="text-sm text-status-dropped">{t("errors.generic")}</p>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t(AUTHOR_LABEL_KEY[itemType])}
            </span>
            <Input name="author" defaultValue={item.author ?? ""} maxLength={200} />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("fieldGenres")}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="inline-flex items-center gap-1 rounded-chip border border-border bg-surface-muted px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
                >
                  {genre}
                  <button
                    type="button"
                    aria-label={t("removeGenre", { genre })}
                    onClick={() => setGenres((prev) => prev.filter((g) => g !== genre))}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {addingGenre ? (
                <input
                  autoFocus
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  onBlur={commitGenre}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitGenre();
                    }
                  }}
                  placeholder={t("genrePlaceholder")}
                  maxLength={40}
                  className="w-32 rounded-chip border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-foreground focus:border-accent focus:outline-none"
                />
              ) : (
                genres.length < MAX_GENRES && (
                  <button
                    type="button"
                    onClick={() => setAddingGenre(true)}
                    className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase hover:text-foreground"
                  >
                    {t("addGenre")}
                  </button>
                )
              )}
            </div>
            {/* updateCatalogItem lee esto como una lista coma-separada. */}
            <input type="hidden" name="genres" value={genres.join(",")} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("fieldSynopsis")}
            </span>
            <textarea
              name="synopsis"
              defaultValue={item.synopsis ?? ""}
              rows={5}
              maxLength={5000}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex flex-col gap-1 sm:w-48">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("fieldYear")}
            </span>
            <Input
              name="year"
              type="number"
              inputMode="numeric"
              defaultValue={item.year ?? ""}
            />
          </label>

          {state.error && (
            <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}
        </form>

        {/* Sagas: contenido absorbido de saga-assign-form.tsx (que se borra).
            Un ítem está en una sola saga a la vez, así que no hay lista, solo
            la chip actual (si la hay) + el formulario para asignar/renombrar. */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {tSaga("title")}
          </span>
          {saga && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {tSaga("current")}{" "}
                <Link
                  href={sagaHref(saga.id)}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {saga.name}
                </Link>
              </span>
              <form action={removeItemFromSaga.bind(null, itemType, itemId)}>
                <Button type="submit" variant="secondary">
                  {tSaga("remove")}
                </Button>
              </form>
            </div>
          )}
          <form action={sagaFormAction} className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="name"
              placeholder={tSaga("namePlaceholder")}
              defaultValue={saga?.name ?? ""}
              className="flex-1"
            />
            <Input
              name="position"
              type="number"
              min={1}
              placeholder={tSaga("positionPlaceholder")}
              className="sm:w-20"
            />
            <Button type="submit" disabled={sagaPending} variant="secondary">
              {sagaPending ? tSaga("submitting") : tSaga("submit")}
            </Button>
          </form>
          {sagaState.error && (
            <p className="text-sm text-status-dropped">{tSaga(`errors.${sagaState.error}`)}</p>
          )}
        </div>

        {/* Ediciones: las series no tienen (su unidad de progreso son los
            episodios, no hay tabla de ediciones para ellas). */}
        {itemType !== "series" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {isMovie ? tEditions("titleMovie") : tEditions("titleBook")}
              </span>
              {/* Solo libros: útil porque el filtro de OpenLibrary (Tarea 5)
                  va a cambiar con el tiempo, y esto deja repetir la búsqueda
                  sin tocar la base de datos a mano. */}
              {itemType === "book" && (
                <button
                  type="button"
                  disabled={resyncPending}
                  onClick={handleResync}
                  className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase hover:text-foreground disabled:opacity-60"
                >
                  {resyncPending ? t("resyncing") : t("resync")}
                </button>
              )}
            </div>
            {resyncError && (
              <p className="text-sm text-status-dropped">{t("errors.generic")}</p>
            )}

            <div className="flex flex-col gap-2">
              {editions.map((edition) => (
                <EditionRow
                  key={edition.id}
                  edition={edition}
                  itemType={itemType}
                  itemId={itemId}
                />
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-card border border-dashed border-border p-3.5">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {isMovie ? tEditions("addMovie") : tEditions("add")}
              </span>
              <form action={createFormAction} className="flex flex-col gap-3">
                <EditionFields isMovie={isMovie} />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={createPending}
                  className="self-start"
                >
                  {createPending ? tEditions("submitting") : tEditions("submit")}
                </Button>
                {createState.error && (
                  <p className="text-sm text-status-dropped">
                    {tEditions(`errors.${createState.error}`)}
                  </p>
                )}
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Barra fija: Guardar cambios envía el <form> de arriba por id (el
          botón vive fuera de él a propósito, para poder quedarse pegado abajo
          sin anidar el resto de formularios de esta pantalla — sagas y
          ediciones — dentro del formulario principal). bottom-16 dejar sitio
          a BottomNav (solo móvil, sticky bottom-0 también); en sm+ no hay
          BottomNav así que baja a bottom-0. */}
      <div className="sticky bottom-16 z-30 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 shadow-card sm:bottom-0 sm:-mx-6 sm:px-6">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" form="catalog-edit-form" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </>
  );
}

function EditionRow({
  edition,
  itemType,
  itemId,
}: {
  edition: Edition;
  itemType: ItemType;
  itemId: string;
}) {
  const t = useTranslations("catalogEdit");
  const isMovie = itemType === "movie";
  const [expanded, setExpanded] = useState(false);

  const updateAction = updateEdition.bind(null, edition.id, itemType, itemId);
  const [state, formAction, pending] = useActionState(updateAction, initialItemState);

  // Mismo patrón prevState que en CatalogEditorForm: cerrar el desplegable
  // tras un guardado correcto se hace durante el render, no en un useEffect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok) setExpanded(false);
  }

  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteState, setDeleteState] = useState<DeleteEditionState>({});

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteEdition(edition.id, itemType, itemId);
      setDeleteState(result);
    });
  }

  const meta = isMovie ? formatEditionMeta(edition) : formatEdition(edition, itemType);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {edition.label}
          </span>
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        </div>
        <button
          type="button"
          aria-label={t("editEdition", { label: edition.label })}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <form action={formAction} className="flex flex-col gap-3">
          <EditionFields
            isMovie={isMovie}
            defaultValues={{
              label: edition.label,
              publisher: edition.publisher,
              year: edition.year,
              language: edition.language,
              totalUnits: edition.totalUnits,
              isbn: edition.isbn,
            }}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={deletePending}
              onClick={handleDelete}
            >
              {t("deleteEdition")}
            </Button>
          </div>
          {state.error && (
            <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}
          {/* inUse no es un fallo: significa que hay pases registrados contra
              esta edición (§ deleteEdition en edit-actions.ts), así que se
              explica en vez de tratarse como un error genérico. */}
          {deleteState.error && (
            <p className="text-sm text-status-dropped">{t(`errors.${deleteState.error}`)}</p>
          )}
        </form>
      )}
    </div>
  );
}
