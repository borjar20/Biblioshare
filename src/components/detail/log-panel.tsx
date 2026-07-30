"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { RatingDots } from "@/components/ui/rating-dots";
import { ChevronDownIcon } from "@/components/ui/icons";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { PassProgress } from "./pass-progress";
import { SessionList } from "@/components/session-list";
import { NoteForm } from "@/components/notes/note-form";
import { StatusSegments } from "@/components/detail/status-segments";
import { useItemStatus } from "@/components/detail/item-status-context";
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
import { ResumePassSheet } from "@/components/detail/resume-pass-sheet";
import { NewPassSheet } from "@/components/detail/new-pass-sheet";
import { AddToCollectionSheet } from "@/components/library/add-to-collection-sheet";
import { PassDiary } from "@/components/detail/pass-diary";
import { EditionPicker } from "@/components/detail/edition-picker";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { formatPosition, type Position } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { updateStatus, removeFromLibrary } from "@/lib/library/manage-actions";
import { ratePass, setPassEdition } from "@/lib/passes/actions";
import { formatEdition, primaryEdition } from "@/lib/editions/edition-label";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";
import { editionChoiceStorageKey } from "@/lib/passes/edition-choice";

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

// Pestaña "Registro" completa (mockup "Paper - Ficha de título completa",
// pantalla 3): estado → progreso del pase abierto → sesiones → diario de
// pases → quitar de la biblioteca. Si el ítem no está en la biblioteca, el
// panel es solo el botón de añadir.
export function LogPanel({
  itemType,
  itemId,
  entry,
  passes,
  sessions,
  editions,
  initialClosingPassId,
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
  // Pase a abrir en la hoja de cierre desde el primer pintado (§Tarea 7,
  // hallazgo de revisión): lo calcula el SERVER component de la ficha leyendo
  // `?cerrar` de `searchParams` (que no se retrasa, a diferencia de
  // useSearchParams en cliente) y ya validado contra el pase activo. Ver el
  // comentario largo en ManagedLog.
  initialClosingPassId?: string | null;
  /** Páginas de la OBRA: respaldo cuando la edición del pase no las trae.
   *  Mismo criterio que addSession (src/lib/sessions/actions.ts), que valida
   *  contra la edición si tiene páginas y si no contra books.total_pages. */
  workTotalUnits?: number | null;
}) {
  if (!entry) {
    // Sin pase activo la pestaña "Mi registro" ni se enseña (ItemDetailTabs la
    // oculta), así que llegar aquí es la ventana transitoria del "Seguir" del
    // hero: estado optimista "planned" mientras la revalidación trae la entry.
    // Un placeholder breve, no el botón "Seguir" (que ahora vive en el hero).
    return <FollowingPlaceholder />;
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
      initialClosingPassId={initialClosingPassId ?? null}
      canContribute={canContribute}
    />
  );
}

// Placeholder de la ventana transitoria tras pulsar "Seguir" en el hero: el
// estado ya es "planned" (optimista) pero la entry del servidor aún no ha
// llegado. Texto sobrio, centrado; desaparece solo cuando la revalidación monta
// ManagedLog.
function FollowingPlaceholder() {
  const t = useTranslations("item");
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {t("following")}
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
  initialClosingPassId,
  canContribute,
}: {
  workTotalUnits?: number | null;
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  initialClosingPassId: string | null;
  canContribute: boolean;
}) {
  const t = useTranslations("item");
  const tPasses = useTranslations("passes");
  const accent = MEDIA_ACCENT[itemType];
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // El estado ya no es local: vive en ItemStatusContext, compartido con el
  // badge del hero, para que ambos cambien en el mismo commit optimista. El
  // `?? entry.status` cubre la ventana de "Quitar de mi biblioteca": ahí se
  // publica null (el badge desaparece), pero este panel sigue montado con la
  // entry vieja hasta que la revalidación lo desmonta — los pills no deben
  // quedarse sin estado que pintar mientras tanto.
  const { status: sharedStatus, setStatus } = useItemStatus();
  const status = sharedStatus ?? entry.status;

  // Pase ACTIVO de la obra (is_active): dueño de las sesiones y objetivo de
  // la hoja de cierre por URL. Se calcula arriba porque el auto-cierre por
  // sesión (más abajo) lo necesita para validar el ?cerrar.
  const activePass = passes.find((p) => p.isActive) ?? null;

  // Resincroniza el estado local con las props tras cada revalidación del
  // servidor. Ajuste durante el render, no un useEffect (mismo patrón que
  // EditionStrip, ver src/components/detail/edition-strip.tsx), porque aquí
  // dispararía react-hooks/set-state-in-effect. El estado (status) ya no se
  // resincroniza aquí: lo hace el ItemStatusProvider con su propia prop de
  // servidor, que cambia en la misma revalidación que esta entry.
  const [prevEntry, setPrevEntry] = useState(entry);
  if (entry !== prevEntry) {
    setPrevEntry(entry);
  }

  // Al marcar "completado" (o "dejado") updateStatus ya cierra el pase en BD
  // (o abre-y-cierra uno si el ítem venía de "planificado") y nos devuelve
  // directamente su id: no hace falta rebuscar entre los pases tras
  // refrescar, basta con encadenar la hoja de cierre con ese passId.
  //
  // El auto-cierre por sesión (§Tarea 7) hace lo mismo por URL: la sesión que
  // alcanza el final redirige a `?cerrar=<passId>&tab=log`. `initialClosingPassId`
  // lo lee y valida el SERVER component de la ficha (contra el pase ACTIVO —
  // nunca uno archivado; ver los tres `page.tsx` de libro/película/serie), así
  // que llega aquí ya validado. Arreglo de la revisión de la Tarea 7: leer
  // `?cerrar` con useSearchParams (cliente) iba un render por detrás tras el
  // redirect de la server action, así que la hoja no se abría sola al
  // terminar un libro — solo tras recargar a mano. El servidor no sufre ese
  // rezago, pero SÍ hace falta el ajuste "durante el render" de abajo (mismo
  // patrón que `entry`/`status` arriba): la ida y vuelta a `/sesion/[passId]`
  // vuelve al MISMO `id` de obra, así que Next reutiliza la instancia ya
  // montada de esta página en vez de remontarla — un `useState` inicializado
  // una sola vez con la prop nunca vería el `cerrar` nuevo sin este
  // seguimiento de `prev`. El `&tab=log` del redirect sigue siendo
  // obligatorio: ItemDetailTabs solo monta la pestaña activa, sin él la ficha
  // abriría en "Información" y este componente ni existiría.
  const [closingPassId, setClosingPassId] = useState<string | null>(
    initialClosingPassId,
  );
  const [prevInitialClosingPassId, setPrevInitialClosingPassId] =
    useState(initialClosingPassId);
  if (initialClosingPassId !== prevInitialClosingPassId) {
    setPrevInitialClosingPassId(initialClosingPassId);
    if (initialClosingPassId) setClosingPassId(initialClosingPassId);
  }

  // Retomar un abandonado (dropped → in_progress) es la única transición que
  // la máquina no resuelve sola: askResume significa que no se escribió nada
  // en BD todavía (el pill optimista de abajo se revierte) y que hace falta
  // preguntar "¿continuar o de cero?" antes de reintentar con `resume`.
  const [resumeOpen, setResumeOpen] = useState(false);

  // "Nuevo pase" con el actual TODAVÍA abierto: hay que saber cómo se cierra
  // el que se deja atrás antes de crear el siguiente (NewPassSheet pregunta).
  const [newPassOpen, setNewPassOpen] = useState(false);

  // Con el pase ya cerrado no hay nada que preguntar: "de cero" sobre un
  // completado/abandonado es exactamente la transición archiveAndCreate que la
  // máquina ya sabe hacer. El `restart` evita el askResume de un abandonado —
  // "Nuevo pase" ya ES la respuesta "de cero".
  function handleNewPass() {
    const active = passes.find((p) => p.isActive) ?? null;
    if (active && active.finishedOn === null) {
      setNewPassOpen(true);
      return;
    }
    // Películas: un revisionado es otro pase "vista" directo, sin pasar por "en
    // curso" (ese estado no existe para pelis, ver StatusSegments). Se archiva
    // el anterior y se crea uno nuevo que se cierra en el acto como vista;
    // encadenamos la hoja de cierre para puntuarlo, igual que marcar "Vista".
    if (itemType === "movie") {
      setStatus("completed");
      startTransition(async () => {
        await updateStatus(itemType, itemId, "in_progress", "restart");
        const outcome = await updateStatus(itemType, itemId, "completed");
        router.refresh();
        if (outcome.kind === "done" && outcome.closed && outcome.passId) {
          setClosingPassId(outcome.passId);
        }
      });
      return;
    }
    setStatus("in_progress");
    startTransition(async () => {
      await updateStatus(itemType, itemId, "in_progress", "restart");
      router.refresh();
    });
  }

  function handleStatusChange(next: MediaStatus) {
    setStatus(next);
    startTransition(async () => {
      const outcome = await updateStatus(itemType, itemId, next);
      if (outcome.kind === "askResume") {
        setStatus(entry.status);
        setResumeOpen(true);
        return;
      }
      router.refresh();
      // Hallazgo de la revisión de la Task 5: en una carrera de doble-submit
      // sin pase activo previo, closed puede llegar true con passId vacío.
      // No abrir la hoja de cierre contra un pase inexistente.
      if (outcome.closed && outcome.passId) {
        setClosingPassId(outcome.passId);
      }
    });
  }

  // El pase ACTIVO (is_active) no siempre es el "abierto": si el ítem está
  // completado/dejado sigue habiendo un pase activo (el cerrado que
  // representa la obra), solo que ya no es "abierto" (ver `activePass`
  // arriba). Las sesiones cuelgan del activo; un pase abierto siempre es
  // también el activo (el índice passes_one_active no permite lo contrario),
  // así que cuando existe openPass son el mismo pase.
  const openPass = passes.find((p) => p.finishedOn === null) ?? null;
  const openPassEdition = openPass
    ? ((openPass.editionId
        ? (editions.find((e) => e.id === openPass.editionId) ?? null)
        : null) ?? primaryEdition(editions))
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
    itemType === "book"
      ? (openPassEdition?.totalUnits ?? workTotalUnits ?? null)
      : null;

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      {/* Frame 10: en PC el Registro son DOS columnas — a la izquierda la
          historia del pase (cabecera, estado, progreso, sesiones, diario) y a
          la derecha sus datos y el quitar.

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
          además aguanta anchos intermedios sin desbordar. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11 lg:gap-y-0">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-1 flex flex-col gap-1.5">
            {/* .pase-hd del frame 3: el eyebrow y la cuenta de pases sustituyen al
            rótulo "Tu estado", que además repetía el aria-label del propio
            control (StatusSegments ya se anuncia como grupo "Tu estado"). El
            ordinal del pase activo es passes.length: vienen del más reciente
            al más antiguo, así que el activo es el último cronológico —
            mismo criterio que el diario. */}
            <div className="mb-2 flex items-center justify-between gap-3">
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
              tendría respuesta honesta. Con el pase ya cerrado el botón actúa
              directo; solo pregunta si sigue abierto. */}
              {status !== "planned" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleNewPass}
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
            <StatusSegments
              status={status}
              itemType={itemType}
              onChange={handleStatusChange}
              disabled={isPending}
            />
          </div>

          {/* La barra va FUERA del panel y encima, como el `.prg` del frame; en
          PC se queda en la columna izquierda. Necesita total conocido: sin él
          no hay porcentaje que enseñar ni cierre automático que avisar. */}
          {openPass &&
            page !== undefined &&
            totalPages !== null &&
            totalPages > 0 && (
              <div className="order-3">
                <PassProgress
                  itemType={itemType}
                  page={page}
                  total={totalPages}
                />
              </div>
            )}

          {itemType !== "movie" && activePass && (
            <div className="order-5">
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

          <div className="order-6">
            <PassDiary
              itemType={itemType}
              itemId={itemId}
              passes={passes}
              editions={editions}
            />
          </div>

          {/* Añadir a Memorizar sin sesión (P7): también para películas. El
              anclaje arranca en la posición actual del pase si es un libro. */}
          <div className="order-7">
            <NoteForm
              itemType={itemType}
              itemId={itemId}
              anchor={
                itemType === "book" ? { kind: "page", page: page ?? null } : { kind: "none" }
              }
            />
          </div>
        </div>

        {/* Columna derecha en PC: los datos del pase y el quitar. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
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
                className="order-7 flex items-center justify-center gap-2 rounded-[10px] border border-border py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                <span aria-hidden>▤</span>
                {t("addToCollection")}
              </button>
            )}
          />

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              // Quitar de la biblioteca = quedarse sin pase activo: el badge del
              // hero debe desaparecer ya, no cuando aterrice la revalidación.
              setStatus(null);
              startTransition(() => removeFromLibrary(itemType, itemId));
            }}
            // `.unfollow` del frame: centrado, rojo y subrayado. No se esconde en
            // gris — quitar una obra de la biblioteca borra TODOS sus pases (ver
            // removeFromLibrary), así que el color dice lo que hace.
            className="order-7 py-3 text-center text-xs text-status-dropped underline underline-offset-2 disabled:opacity-60"
          >
            {t("unfollow")}
          </button>
        </div>
      </div>

      {closingPassId && (
        <ClosePassSheet
          passId={closingPassId}
          itemType={itemType}
          itemId={itemId}
          open
          onClose={() => setClosingPassId(null)}
        />
      )}

      {newPassOpen && (
        <NewPassSheet
          itemType={itemType}
          itemId={itemId}
          open
          onClose={() => {
            setNewPassOpen(false);
            router.refresh();
          }}
        />
      )}

      {resumeOpen && (
        <ResumePassSheet
          itemType={itemType}
          itemId={itemId}
          droppedAtLabel={formatPosition(itemType, entry.position)}
          open
          onClose={() => {
            setResumeOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// Panel "Progreso" del mockup: solo existe mientras hay un pase abierto ("lo
// estoy leyendo/viendo ahora"). La nota se guarda con ratePass — NO con
// updatePass, que siempre escribe finished_on y cerraría el pase de tapadillo
// (ver el comentario en src/lib/passes/actions.ts). La página actual sale de
// `entry.position` (library_entries), comparada contra las páginas de la
// edición del pase — o la primaria si el pase no tiene una asignada todavía.
// OJO (ventana transicional Tarea 7→9): desde que las sesiones cuelgan del
// pase, esta cifra deja de refrescarse tras registrar una sesión —
// library_entries.position ya no la escribe nadie. El barrido de la Tarea 9
// (derivar esto de diary_entries) la pone al día otra vez.
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
  // tiene sentido si hay más de una edición entre las que elegir y el pase
  // abierto todavía no tiene una asignada. Elegir una edición de verdad la
  // hace desaparecer sola (openPass.editionId deja de ser null). La salida
  // "No lo sé" no fija edición, así que sin recordarla se repetiría en cada
  // recarga: se guarda en localStorage bajo una clave por passId (no por
  // ítem, ver src/lib/passes/edition-asked.ts), para que una relectura (pase
  // nuevo) vuelva a preguntar. El componente está keyed por openPass.id (ver
  // ManagedLog), así este inicializador se ejecuta de nuevo con cada pase
  // distinto sin releer localStorage durante el render.
  const [answered, setAnswered] = useState(() => readEditionAsked(openPass.id));
  const pendingEditionQuestion =
    itemType !== "series" &&
    editions.length > 1 &&
    openPass.editionId === null &&
    !answered;

  // Aplica la elección de edición guardada AL SEGUIR (Hallazgo 3 de la
  // revisión final): si en localStorage hay una edición elegida para este
  // ítem y este pase recién abierto todavía no tiene una propia, se aplica
  // aquí con setPassEdition y se olvida la elección — el usuario ya la
  // contestó al seguir, no debe volver a verla. No sincroniza ningún estado
  // local (no llama a ningún setState de este componente): solo dispara una
  // escritura de servidor, así que vive en un efecto imperativo, no en el
  // ajuste "durante el render" de más arriba (mismo criterio que el
  // scrollIntoView de EditionStrip). Deliberadamente solo al montar: el
  // componente está keyed por openPass.id (ver ManagedLog), así que un pase
  // nuevo (p. ej. una relectura) vuelve a montar este efecto y lee de nuevo.
  useEffect(() => {
    if (openPass.editionId !== null) return;
    let choice: string | null = null;
    try {
      choice = window.localStorage.getItem(editionChoiceStorageKey(itemId));
    } catch {
      return;
    }
    if (!choice) return;
    try {
      window.localStorage.removeItem(editionChoiceStorageKey(itemId));
    } catch {
      // Si no se puede borrar, en el peor caso se reintenta en la próxima
      // recarga: no rompe nada más.
    }
    startTransition(() =>
      setPassEdition(openPass.id, itemType, itemId, choice),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      className="order-4 group flex flex-col rounded-[12px] border border-border bg-surface"
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
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
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
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
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
