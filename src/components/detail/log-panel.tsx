"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { PassProgress } from "./pass-progress";
import { SessionList } from "@/components/session-list";
import { StatusSegments } from "@/components/detail/status-segments";
import { useItemStatus } from "@/components/detail/item-status-context";
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
import { ResumePassSheet } from "@/components/detail/resume-pass-sheet";
import { PassDiary } from "@/components/detail/pass-diary";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { formatPosition, type Position } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import type { Queue } from "@/lib/queue/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import {
  updateStatus,
  removeFromLibrary,
  moveEntryToQueue,
} from "@/lib/library/manage-actions";
import { ratePass, setPassEdition } from "@/lib/passes/actions";
import { formatEdition, primaryEdition } from "@/lib/editions/edition-label";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";
import { editionChoiceStorageKey } from "@/lib/passes/edition-choice";

// Guarda la edición elegida AL SEGUIR (Hallazgo 3): se llama solo desde un
// manejador de clic (FollowButton.follow), nunca durante el render, así que
// escribir en localStorage aquí no viola la regla de pureza de render. Se
// aplicará sola con setPassEdition en cuanto se abra el primer pase del
// ítem (ver el efecto en ProgressBlock más abajo).
function writeEditionChoice(itemId: string, editionId: string) {
  try {
    window.localStorage.setItem(editionChoiceStorageKey(itemId), editionId);
  } catch {
    // Cuota llena o almacenamiento inaccesible (modo privado): la elección se
    // pierde y se volverá a preguntar al empezar a leer, pero no rompe nada.
  }
}

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
  queueId: string | null;
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
  queues,
  initialClosingPassId,
  workTotalUnits,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  queues: Queue[];
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
    return (
      <FollowButton itemType={itemType} itemId={itemId} editions={editions} />
    );
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
      queues={queues}
      initialClosingPassId={initialClosingPassId ?? null}
    />
  );
}

// Botón de "Seguir" cuando el ítem todavía no está en la biblioteca (Tarea
// 3, Paso 1). Con más de una edición, primero pregunta cuál tienes — con una
// sola (o ninguna) se añade directo, como antes. "No lo sé" es una salida
// legítima, no un error: no fija edición y el progreso se mide contra la
// primaria (se puede volver a preguntar más tarde, al empezar a leer).
function FollowButton({
  itemType,
  itemId,
  editions,
}: {
  itemType: ItemType;
  itemId: string;
  editions: Edition[];
}) {
  const t = useTranslations("item");
  const tEditions = useTranslations("editions");
  const [isPending, startTransition] = useTransition();
  const [choosingEdition, setChoosingEdition] = useState(false);
  const { setStatus } = useItemStatus();

  function follow(editionId: string | null) {
    // "No lo sé" (editionId null) no guarda nada: se comporta como hoy, el
    // progreso se mide contra la primaria. Con una edición elegida de
    // verdad, se guarda ANTES de disparar la transición — sigue siendo un
    // manejador de clic, no el cuerpo del render.
    if (editionId) writeEditionChoice(itemId, editionId);
    // Seguir una obra la deja "pendiente": el badge del hero lo enseña ya.
    setStatus("planned");
    startTransition(() => addExistingItemToLibrary(itemType, itemId));
  }

  if (!choosingEdition) {
    return (
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (editions.length > 1) setChoosingEdition(true);
          else follow(null);
        }}
      >
        {isPending ? t("following") : t("follow")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-card">
      <span className="text-sm font-medium">{tEditions("whichEdition")}</span>
      <div className="flex flex-col gap-1.5">
        {editions.map((edition) => (
          <button
            key={edition.id}
            type="button"
            disabled={isPending}
            onClick={() => follow(edition.id)}
            className="rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:opacity-60"
          >
            {formatEdition(edition, itemType)}
          </button>
        ))}
        <button
          type="button"
          disabled={isPending}
          onClick={() => follow(null)}
          className="rounded-md border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-surface-muted disabled:opacity-60"
        >
          {tEditions("unknownEdition")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {tEditions("unknownEditionHint")}
      </p>
    </div>
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
  queues,
  initialClosingPassId,
}: {
  workTotalUnits?: number | null;
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  queues: Queue[];
  initialClosingPassId: string | null;
}) {
  const t = useTranslations("item");
  const tQueue = useTranslations("queue");
  const tSegments = useTranslations("detail.statusSegments");
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
  const [queueId, setQueueId] = useState(entry.queueId);

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
    if (entry.queueId !== queueId) setQueueId(entry.queueId);
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

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{tSegments("groupLabel")}</span>
        <StatusSegments
          status={status}
          itemType={itemType}
          onChange={handleStatusChange}
          disabled={isPending}
        />
      </div>

      {/* Elegir cola: solo tiene sentido mientras el ítem está planificado
          (§7.22). Al salir de "planned" el server limpia queue_id. */}
      {status === "planned" && queues.length > 0 && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`log-queue-${entry.entryId}`}
            className="text-sm font-medium"
          >
            {tQueue("title")}
          </label>
          <Select
            id={`log-queue-${entry.entryId}`}
            value={queueId ?? ""}
            disabled={isPending}
            onChange={(event) => {
              const next = event.target.value || null;
              setQueueId(next);
              startTransition(() => moveEntryToQueue(itemType, itemId, next));
            }}
          >
            <option value="">{tQueue("noQueue")}</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {openPass && (
        // key={openPass.id}: fuerza un remount cuando cambia de pase (p. ej.
        // una relectura), para que el inicializador de useState que lee
        // localStorage (readEditionAsked) se ejecute de nuevo con la clave
        // del pase nuevo, sin tener que releer localStorage durante el
        // render.
        <ProgressBlock
          key={openPass.id}
          itemType={itemType}
          itemId={itemId}
          entry={entry}
          openPass={openPass}
          openPassEdition={openPassEdition}
          workTotalUnits={workTotalUnits}
          editions={editions}
        />
      )}

      {itemType !== "movie" && activePass && (
        <SessionList
          passId={activePass.id}
          itemType={itemType}
          itemId={itemId}
          sessions={sessions}
          editionLabel={
            openPassEdition ? formatEdition(openPassEdition, itemType) : null
          }
        />
      )}

      <PassDiary
        itemType={itemType}
        itemId={itemId}
        passes={passes}
        editions={editions}
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
        className="self-start text-xs text-muted-foreground underline hover:text-status-dropped disabled:opacity-60"
      >
        {t("unfollow")}
      </button>

      {closingPassId && (
        <ClosePassSheet
          passId={closingPassId}
          itemType={itemType}
          itemId={itemId}
          open
          onClose={() => setClosingPassId(null)}
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
function ProgressBlock({
  itemType,
  itemId,
  entry,
  openPass,
  openPassEdition,
  editions,
  workTotalUnits,
}: {
  itemType: ItemType;
  itemId: string;
  entry: { position: Position };
  workTotalUnits?: number | null;
  openPass: Pass;
  openPassEdition: Edition | null;
  editions: Edition[];
}) {
  const t = useTranslations("detail.log");
  const tPasses = useTranslations("passes");
  const tSessions = useTranslations("item.sessions");
  const tEditions = useTranslations("editions");
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
    <>
      {/* La barra del pase va FUERA del panel y encima, como el .prg del
          frame 3. Necesita total conocido: sin él no hay porcentaje que
          enseñar ni cierre automático que avisar. */}
      {page !== undefined && totalPages !== null && totalPages > 0 && (
        <PassProgress itemType={itemType} page={page} total={totalPages} />
      )}

      <div className="flex flex-col gap-2.5 rounded-md border border-border bg-surface-muted p-3">
        <span className="text-xs font-semibold text-foreground">
          {t("progressTitle")}
        </span>

        {/* Fila pendiente: arriba del todo, y no un modal. Desaparece al
          contestar (incluida la salida "No lo sé", que además se recuerda en
          localStorage para no repetirse en cada recarga). */}
        {pendingEditionQuestion && (
          <div className="flex flex-col gap-1.5 rounded-md border border-accent bg-surface p-2.5">
            <span className="text-xs font-semibold text-foreground">
              {tEditions("whichEditionReading")}
            </span>
            <div className="flex flex-col gap-1">
              {editions.map((edition) => (
                <button
                  key={edition.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setAnswered(true);
                    startTransition(() =>
                      setPassEdition(openPass.id, itemType, itemId, edition.id),
                    );
                  }}
                  className="rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:bg-surface-muted disabled:opacity-60"
                >
                  {formatEdition(edition, itemType)}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  // "No lo sé" no fija edición: se recuerda por passId para
                  // que no vuelva a preguntar en cada recarga (sí volverá a
                  // preguntar si se abre un pase nuevo, p. ej. una relectura).
                  writeEditionAsked(openPass.id);
                  setAnswered(true);
                }}
                className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-muted disabled:opacity-60"
              >
                {tEditions("unknownEdition")}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tEditions("unknownEditionHint")}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {tPasses("rating")}
          </span>
          <StarRating
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
    </>
  );
}
