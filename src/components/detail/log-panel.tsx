"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { RatingDots } from "@/components/ui/rating-dots";
import { ChevronDownIcon } from "@/components/ui/icons";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { PassProgress } from "./pass-progress";
import { SessionList } from "@/components/session-list";
import { NoteForm } from "@/components/notes/note-form";
import { useItemStatus } from "@/components/detail/item-status-context";
import { usePassActions } from "@/components/detail/pass-actions-provider";
import { AddToCollectionSheet } from "@/components/library/add-to-collection-sheet";
import { PassDiary } from "@/components/detail/pass-diary";
import { EditionPicker } from "@/components/detail/edition-picker";
import { shouldAskForEdition } from "@/components/detail/edition-question";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { ratePass, setPassEdition } from "@/lib/passes/actions";
import { formatEdition, pagesForPass } from "@/lib/editions/edition-label";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";

// Lee si a este pase ya se le preguntó "¿qué edición estás leyendo?" y el
// usuario contestó "No lo sé". Se llama solo desde el inicializador de
// useState de ProgressBlock (nunca en un efecto ni durante el cuerpo del
// render): así el primer pintado ya sabe si la pregunta debe mostrarse, sin
// lecturas impuras en render (mismo patrón que session-timer.tsx).
function readEditionAsked(passId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(editionAskedStorageKey(passId)) === "1";
  } catch {
    return false;
  }
}

function writeEditionAsked(passId: string) {
  try {
    window.localStorage.setItem(editionAskedStorageKey(passId), "1");
  } catch {
    // Cuota llena o almacenamiento inaccesible (modo privado): la pregunta
    // podrá volver a aparecer tras recargar, pero no rompe nada más.
  }
}

// Mismo tipo que el panel de gestión que este componente jubila: lo
// exportamos ahora desde aquí porque este es el nuevo punto de entrada de la
// pestaña Registro.
export type ManagedEntry = {
  entryId: string;
  status: MediaStatus;
  rating: number | null;
  position: Position;
  notes: string | null;
};

// Pestaña «Mi registro» (mockup "Paper - Ficha de título completa", pantalla
// 3), solo historial desde la spec 2026-11-10-ficha-acciones: cabecera del
// pase con «Nuevo pase» → progreso del pase abierto → sesiones → diario de
// pases → notas. El estado, la acción principal, la nota y sus hojas viven en
// la tarjeta del hero (PassCard + PassActionsProvider); quitar la obra, en el
// menú «···» del hero.
export function LogPanel({
  itemType,
  itemId,
  entry,
  passes,
  sessions,
  editions,
  workTotalUnits,
  canContribute = false,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  /** Colaborador+: habilita "+ Es una edición nueva" en el selector. */
  canContribute?: boolean;
  /** Páginas de la OBRA: respaldo cuando la edición del pase no las trae.
   *  Mismo criterio que addSession (src/lib/sessions/actions.ts), que valida
   *  contra la edición si tiene páginas y si no contra books.total_pages. */
  workTotalUnits?: number | null;
}) {
  if (!entry) {
    // Sin pase activo la pestaña «Mi registro» ni se enseña (ItemDetailTabs la
    // oculta), así que llegar aquí es la ventana transitoria de una intención
    // de la tarjeta («Quiero leerlo»…): estado optimista mientras la
    // revalidación trae la entry. Un placeholder breve.
    return <AddingPlaceholder />;
  }

  return (
    <ManagedLog
      workTotalUnits={workTotalUnits}
      itemType={itemType}
      itemId={itemId}
      entry={entry}
      passes={passes}
      sessions={sessions}
      editions={editions}
      canContribute={canContribute}
    />
  );
}

// Placeholder de la ventana transitoria tras elegir una intención en la
// tarjeta: el estado ya es optimista pero la entry del servidor aún no ha
// llegado. Texto sobrio, centrado; desaparece solo cuando la revalidación monta
// ManagedLog.
function AddingPlaceholder() {
  const t = useTranslations("item");
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {t("addingToLibrary")}
    </p>
  );
}

function ManagedLog({
  workTotalUnits,
  itemType,
  itemId,
  entry,
  passes,
  sessions,
  editions,
  canContribute,
}: {
  workTotalUnits?: number | null;
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  canContribute: boolean;
}) {
  const t = useTranslations("item");
  const tPasses = useTranslations("passes");
  const accent = MEDIA_ACCENT[itemType];
  // El estado se cambia en la tarjeta del hero (PassCard); aquí solo se lee,
  // del mismo ItemStatusContext, para saber si «Nuevo pase» tiene sentido. El
  // `?? entry.status` cubre la ventana de «Quitar de mi biblioteca» (menú del
  // hero): ahí se publica null, pero este panel sigue montado con la entry
  // vieja hasta que la revalidación lo desmonta.
  const { status: sharedStatus } = useItemStatus();
  const status = sharedStatus ?? entry.status;
  // «Nuevo pase» y sus hojas son del proveedor (montado por encima de las
  // pestañas): así la pregunta de cierre es la misma se pulse donde se pulse.
  const { isPending, newPass } = usePassActions();

  // Pase ACTIVO de la obra (is_active): dueño de las sesiones.
  const activePass = passes.find((p) => p.isActive) ?? null;

  // El pase ACTIVO (is_active) no siempre es el "abierto": si el ítem está
  // completado/dejado sigue habiendo un pase activo (el cerrado que
  // representa la obra), solo que ya no es "abierto" (ver `activePass`
  // arriba). Las sesiones cuelgan del activo; un pase abierto siempre es
  // también el activo (el índice passes_one_active no permite lo contrario),
  // así que cuando existe openPass son el mismo pase.
  const openPass = passes.find((p) => p.status === "planned" || p.status === "in_progress") ?? null;
  // La edición del pase, y solo esa: la que el usuario identificó. Sin ella no
  // se busca una sustituta (la «edición primaria» murió, spec 2026-08-26 §5) —
  // manda `workTotalUnits`, las páginas orientativas de la obra.
  const openPassEdition =
    openPass?.editionId != null
      ? (editions.find((e) => e.id === openPass.editionId) ?? null)
      : null;

  // Página del pase y su total. Se calculan AQUÍ, en el antecesor común, y no
  // dentro del panel: en PC la barra se queda en la columna izquierda y el
  // panel cruza a la derecha, así que los dos necesitan el dato y ninguno es
  // padre del otro.
  let page: number | undefined;
  if (
    itemType === "book" &&
    "page" in entry.position &&
    entry.position.page !== undefined
  ) {
    page = entry.position.page;
  }
  // La edición del pase manda; si no trae páginas (pasa, y mucho: OpenLibrary
  // no siempre las da), cae al total de la obra. Mismo criterio que addSession.
  const totalPages =
    itemType === "book" ? pagesForPass(openPassEdition, workTotalUnits) : null;

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      {/* Frame 10: en PC el Registro son DOS columnas — a la izquierda la
          historia del pase (cabecera, progreso, sesiones, diario) y a la
          derecha sus datos. El estado ya no se cambia aquí: es de la tarjeta
          del hero (spec 2026-11-10-ficha-acciones), y quitar la obra vive en
          el menú «···» del hero.

          El DOM es UNO solo. Los envoltorios van en `display:contents` en
          móvil, así que sus hijos caen directos en la columna flex de fuera y
          se ordenan con `order` — que es el orden del frame 3, con el panel
          entre la barra y las sesiones. En `lg` pasan a ser columnas de
          verdad. La alternativa era duplicar el árbol, y el panel tiene estado
          propio (la nota, la pregunta de edición): dos copias divergirían. */}
      {/* El frame fija las dos columnas (378 y 340), pero sus medidas son de
          un lienzo sin la tarjeta que envuelve nuestra pestaña: sumadas con el
          hueco se salen por la derecha. Se fija solo la DERECHA —340 es el
          ancho de diseño del panel— y la izquierda toma lo que quede, que
          además aguanta anchos intermedios sin desbordar. Solo desde `xl`: de
          1024 a 1279 la columna de cartel deja unos 600 px y no caben dos. */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-x-11 xl:gap-y-0">
        <div className="contents xl:flex xl:flex-col xl:gap-4">
          <div className="order-1">
            {/* .pase-hd del frame 3: el eyebrow y la cuenta de pases. El
            ordinal del pase activo es passes.length: vienen del más reciente
            al más antiguo, así que el activo es el último cronológico —
            mismo criterio que el diario. */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="block font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">
                  {tPasses("activeLabel")}
                </span>
                <span className="font-serif text-base leading-tight font-semibold">
                  {tPasses(`nth.${itemType}`, { n: passes.length })}
                </span>
              </div>

              {/* "Nuevo pase" = cerrar el actual y empezar otro de cero. No se
              pinta sobre un PENDIENTE: ahí no hay nada que cerrar todavía (el
              pase no ha empezado), así que archivarlo para crear otro igual de
              vacío no diría nada nuevo — y "¿completado o abandonado?" no
              tendría respuesta honesta. Con el pase ya cerrado el proveedor actúa
              directo; solo pregunta (NewPassSheet) si sigue abierto. */}
              {status !== "planned" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={newPass}
                  // `.newpase` del frame: mono 10, TEÑIDO del acento del medio y
                  // con el borde a medio camino entre el acento y --border
                  // (color-mix al 35%). En #56 salió gris, que lo hacía parecer un
                  // enlace secundario más.
                  className={`shrink-0 rounded-lg border px-[11px] py-1.5 font-mono text-[10px] font-medium whitespace-nowrap disabled:opacity-60 ${accent.text} ${accent.borderSoft}`}
                >
                  {tPasses("newPass")}
                </button>
              )}
            </div>
          </div>

          {/* La barra va FUERA del panel y encima, como el `.prg` del frame; en
          PC se queda en la columna izquierda. Necesita total conocido: sin él
          no hay porcentaje que enseñar ni cierre automático que avisar. */}
          {openPass &&
            page !== undefined &&
            totalPages !== null &&
            totalPages > 0 && (
              <div className="order-2">
                <PassProgress
                  itemType={itemType}
                  page={page}
                  total={totalPages}
                />
              </div>
            )}

          {itemType !== "movie" && activePass && (
            <div className="order-4">
              <SessionList
                passId={activePass.id}
                itemType={itemType}
                itemId={itemId}
                sessions={sessions}
                editionLabel={
                  openPassEdition
                    ? formatEdition(openPassEdition, itemType)
                    : null
                }
              />
            </div>
          )}

          <div className="order-5">
            <PassDiary
              itemType={itemType}
              itemId={itemId}
              passes={passes}
              editions={editions}
            />
          </div>

          {/* Añadir a Memorizar sin sesión (P7): también para películas. El
              anclaje arranca en la posición actual del pase si es un libro. */}
          <div className="order-6">
            <NoteForm
              itemType={itemType}
              itemId={itemId}
              anchor={
                itemType === "book" ? { kind: "page", page: page ?? null } : { kind: "none" }
              }
            />
          </div>
        </div>

        {/* Columna derecha en PC: los datos del pase y «Añadir a colección». */}
        <div className="contents xl:flex xl:flex-col xl:gap-4">
          {openPass && (
            // key={openPass.id}: fuerza un remount cuando cambia de pase (p. ej.
            // una relectura), para que el inicializador de useState que lee
            // localStorage (readEditionAsked) se ejecute de nuevo con la clave
            // del pase nuevo, sin tener que releer localStorage durante el
            // render.
            <PassDataPanel
              key={openPass.id}
              itemType={itemType}
              itemId={itemId}
              openPass={openPass}
              passes={passes}
              page={page}
              totalPages={totalPages}
              editions={editions}
              canContribute={canContribute}
            />
          )}

          {/* «Añadir a colección» (frame D, Colección v2 S2): mismo <dialog>
          reutilizable que el disparador del grid (library-item-card.tsx).
          Solo tiene sentido con la obra ya en biblioteca — este bloque entero
          está detrás de `entry`, así que se cumple por construcción. */}
          <AddToCollectionSheet
            itemType={itemType}
            itemId={itemId}
            renderTrigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="order-6 flex items-center justify-center gap-2 rounded-[10px] border border-border py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                <span aria-hidden>▤</span>
                {t("addToCollection")}
              </button>
            )}
          />

        </div>
      </div>
    </div>
  );
}

// Panel "Progreso" del mockup: solo existe mientras hay un pase abierto ("lo
// estoy leyendo/viendo ahora"). La nota se guarda con ratePass — NO con
// updatePass, que siempre escribe finished_on y cerraría el pase de tapadillo
// (ver el comentario en src/lib/passes/actions.ts). La página actual sale de
// `entry.position` (passes.position del pase activo), comparada contra las
// páginas de la edición del pase — o las páginas orientativas de la obra si
// el pase no tiene una edición asignada todavía.
function PassDataPanel({
  itemType,
  itemId,
  openPass,
  passes,
  editions,
  page,
  totalPages,
  canContribute,
}: {
  itemType: ItemType;
  itemId: string;
  openPass: Pass;
  /** Todos los pases: el selector de edición destaca las YA USADAS (frame 7).
   *  El abierto no aporta (su editionId es null justo cuando se pregunta). */
  passes: Pass[];
  editions: Edition[];
  /** Página actual del pase, ya calculada por ManagedLog (la comparte con la
   *  barra, que en PC vive en la otra columna). */
  page: number | undefined;
  totalPages: number | null;
  canContribute: boolean;
}) {
  const t = useTranslations("detail.log");
  const tPasses = useTranslations("passes");
  const tSessions = useTranslations("item.sessions");
  const tEditions = useTranslations("editions");
  const accent = MEDIA_ACCENT[itemType];
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(openPass.rating);

  // Resync tras revalidación (p. ej. otra pestaña cambió la nota o la
  // edición del pase). Mismo patrón "ajuste durante el render" de arriba.
  const [prevOpenPass, setPrevOpenPass] = useState(openPass);
  if (openPass !== prevOpenPass) {
    setPrevOpenPass(openPass);
    if (openPass.rating !== rating) setRating(openPass.rating);
  }

  // Pregunta pendiente "¿qué edición estás leyendo?" (Tarea 3, Paso 2): solo
  // tiene sentido si hay algo que ofrecer y el pase
  // abierto todavía no tiene una asignada. Elegir una edición de verdad la
  // hace desaparecer sola (openPass.editionId deja de ser null). La salida
  // "No lo sé" no fija edición, así que sin recordarla se repetiría en cada
  // recarga: se guarda en localStorage bajo una clave por passId (no por
  // ítem, ver src/lib/passes/edition-asked.ts), para que una relectura (pase
  // nuevo) vuelva a preguntar. El componente está keyed por openPass.id (ver
  // ManagedLog), así este inicializador se ejecuta de nuevo con cada pase
  // distinto sin releer localStorage durante el render.
  const [answered, setAnswered] = useState(() => readEditionAsked(openPass.id));
  // La regla vive en edition-question.ts, pura y testeada: cuándo hay algo que
  // ofrecer dejó de ser «más de una edición en la ficha» al morir el sync
  // masivo, y ese umbral tapaba el selector justo en los libros que más lo
  // necesitan. El porqué completo, en la cabecera de ese fichero.
  const pendingEditionQuestion = shouldAskForEdition({
    itemType,
    editionCount: editions.length,
    passEditionId: openPass.editionId,
    answered,
  });

  // El `.panel` del frame 3 (y el `.desk-panel` del 10): fondo --surface (NO
  // --surface-muted, que es el --surface-2 del handoff — con el panel un
  // peldaño más oscuro todo lo de dentro se lavaba y los dots apagados
  // desaparecían), radio 12 y cabecera separada del cuerpo por el borde.
  //
  // Plegable con <details>/<summary> nativo, como la matriz del reto de listas
  // (list-challenge-board.tsx): el navegador ya trae el estado, el teclado y
  // la semántica de "abrir/cerrar". Nace abierto porque es el panel del pase
  // en curso — plegarlo es para quitarlo de en medio, no el estado normal.
  return (
    <details
      open
      className="order-3 group flex flex-col rounded-[12px] border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-[15px] py-[13px] text-[13px] font-semibold text-foreground">
        {t("progressTitle")}
        {/* Abierto apunta ABAJO, que es el `▾` que pinta el frame; cerrado
              apunta a la derecha. (list-challenge-board hace lo contrario —
              abierto arriba — pero ahí el chevron va ANTES del texto, como una
              flecha de árbol; aquí cierra la fila por la derecha.) */}
        <ChevronDownIcon
          aria-hidden
          className="h-3 w-3 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
        />
      </summary>

      <div className="flex flex-col gap-2.5 border-t border-border px-[15px] pt-3.5 pb-[15px]">
        {/* Fila pendiente: arriba del todo, y no un modal. Desaparece al
          contestar (incluida la salida "No lo sé", que además se recuerda en
          localStorage para no repetirse en cada recarga). El selector es el
          del frame 7 — con las ediciones de pases anteriores destacadas
          arriba, que en una relectura es reusar la del pase anterior en un
          clic. */}
        {pendingEditionQuestion && (
          <div className={`rounded-md border p-2.5 ${accent.border}`}>
            <EditionPicker
              itemType={itemType}
              itemId={itemId}
              editions={editions}
              passes={passes}
              title={tEditions("whichEditionReading")}
              disabled={isPending}
              canContribute={canContribute}
              // Con el pase delante, el selector puede ofrecer además las dos
              // vías que ESCRIBEN contra él: escanear el ISBN (exacta) y las
              // candidatas en vivo de OpenLibrary (aproximada).
              passId={openPass.id}
              onPick={(editionId) => {
                setAnswered(true);
                startTransition(() =>
                  setPassEdition(openPass.id, itemType, itemId, editionId),
                );
              }}
              onUnknown={() => {
                // "No lo sé" no fija edición: se recuerda por passId para
                // que no vuelva a preguntar en cada recarga (sí volverá a
                // preguntar si se abre un pase nuevo, p. ej. una relectura).
                writeEditionAsked(openPass.id);
                setAnswered(true);
              }}
              // La candidata ya quedó registrada y asociada al pase en el
              // servidor (chooseEditionCandidate); aquí solo se cierra la
              // pregunta, sin un segundo setPassEdition que la repita.
              onCandidatePicked={() => setAnswered(true)}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="label-section">
            {tPasses("rating")}
          </span>
          <RatingDots
            value={rating}
            onChange={(next) => {
              setRating(next);
              startTransition(() =>
                ratePass(openPass.id, itemType, itemId, next),
              );
            }}
            size="sm"
            itemType={itemType}
          />
        </div>

        {page !== undefined && (
          <p className="text-xs text-muted-foreground">
            {totalPages !== null
              ? t("page", { page, total: totalPages })
              : t("pageOnly", { page })}
          </p>
        )}

        {/* Las series no tienen ediciones: sin selector para ellas. Mientras la
          pregunta pendiente de arriba está sin contestar, no repetimos el
          mismo selector aquí abajo. */}
        {itemType !== "series" &&
          editions.length > 0 &&
          !pendingEditionQuestion && (
            <div className="flex flex-col gap-1">
              <span className="label-section">
                {t("edition")}
              </span>
              <Select
                size="sm"
                value={openPass.editionId ?? ""}
                disabled={isPending}
                onChange={(event) => {
                  const next = event.target.value || null;
                  startTransition(() =>
                    setPassEdition(openPass.id, itemType, itemId, next),
                  );
                }}
              >
                <option value="">{t("noEdition")}</option>
                {editions.map((edition) => (
                  <option key={edition.id} value={edition.id}>
                    {formatEdition(edition, itemType)}
                  </option>
                ))}
              </Select>
            </div>
          )}

        {/* Las películas no tienen sesiones (§7.14 scope decision). El pase
          abierto es siempre el activo (ver comentario de ManagedLog), así
          que openPass.id es el id correcto para la ruta. */}
        {itemType !== "movie" && (
          <Link
            href={`/sesion/${openPass.id}`}
            className="self-start text-xs text-muted-foreground underline hover:text-foreground"
          >
            {tSessions("add")}
          </Link>
        )}
      </div>
    </details>
  );
}
