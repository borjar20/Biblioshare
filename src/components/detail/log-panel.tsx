"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { SessionList } from "@/components/session-list";
import { StatusSegments } from "@/components/detail/status-segments";
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
import { PassDiary } from "@/components/detail/pass-diary";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
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
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  queues: Queue[];
}) {
  if (!entry) {
    return <FollowButton itemType={itemType} itemId={itemId} editions={editions} />;
  }

  return (
    <ManagedLog
      itemType={itemType}
      itemId={itemId}
      entry={entry}
      passes={passes}
      sessions={sessions}
      editions={editions}
      queues={queues}
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

  function follow(editionId: string | null) {
    startTransition(() =>
      addExistingItemToLibrary(itemType, itemId, undefined, editionId)
    );
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
      <p className="text-xs text-muted-foreground">{tEditions("unknownEditionHint")}</p>
    </div>
  );
}

function ManagedLog({
  itemType,
  itemId,
  entry,
  passes,
  sessions,
  editions,
  queues,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  queues: Queue[];
}) {
  const t = useTranslations("item");
  const tQueue = useTranslations("queue");
  const tSegments = useTranslations("detail.statusSegments");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(entry.status);
  const [queueId, setQueueId] = useState(entry.queueId);

  // Resincroniza el estado local con las props tras cada revalidación del
  // servidor (cambio de estado, cola...). Ajuste durante el render, no un
  // useEffect (mismo patrón que EditionStrip, ver
  // src/components/detail/edition-strip.tsx), porque aquí dispararía
  // react-hooks/set-state-in-effect.
  const [prevEntry, setPrevEntry] = useState(entry);
  if (entry !== prevEntry) {
    setPrevEntry(entry);
    if (entry.status !== status) setStatus(entry.status);
    if (entry.queueId !== queueId) setQueueId(entry.queueId);
  }

  // Al marcar "completado" hay que abrir la hoja de cierre con el pase que
  // se acaba de cerrar. updateStatus ya lo cierra en BD (o abre-y-cierra uno
  // si el ítem venía de "planificado"); aquí solo hace falta refrescar y, en
  // cuanto lleguen los pases nuevos, coger el primero — sin pase abierto por
  // delante, es el que se acaba de cerrar (getPasses ordena el abierto
  // primero si lo hay, si no el cerrado más reciente).
  const [pendingComplete, setPendingComplete] = useState(false);
  const [closingPassId, setClosingPassId] = useState<string | null>(null);
  const [prevPasses, setPrevPasses] = useState(passes);
  if (passes !== prevPasses) {
    setPrevPasses(passes);
    if (pendingComplete) {
      setPendingComplete(false);
      const justClosed = passes.find((p) => p.finishedOn !== null) ?? null;
      if (justClosed) setClosingPassId(justClosed.id);
    }
  }

  function handleStatusChange(next: MediaStatus) {
    setStatus(next);
    if (next === "completed") setPendingComplete(true);
    startTransition(async () => {
      await updateStatus(entry.entryId, itemType, itemId, next);
      router.refresh();
    });
  }

  const openPass = passes.find((p) => p.finishedOn === null) ?? null;
  const openPassEdition = openPass
    ? (openPass.editionId
        ? (editions.find((e) => e.id === openPass.editionId) ?? null)
        : null) ?? primaryEdition(editions)
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
              startTransition(() =>
                moveEntryToQueue(entry.entryId, itemType, itemId, next)
              );
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
          editions={editions}
        />
      )}

      {itemType !== "movie" && (
        <SessionList
          entryId={entry.entryId}
          itemType={itemType}
          itemId={itemId}
          sessions={sessions}
          editionLabel={openPassEdition ? formatEdition(openPassEdition, itemType) : null}
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
        onClick={() =>
          startTransition(() => removeFromLibrary(entry.entryId, itemType, itemId))
        }
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
    </div>
  );
}

// Panel "Progreso" del mockup: solo existe mientras hay un pase abierto ("lo
// estoy leyendo/viendo ahora"). La nota se guarda con ratePass — NO con
// updatePass, que siempre escribe finished_on y cerraría el pase de tapadillo
// (ver el comentario en src/lib/passes/actions.ts). La página actual sale de
// library_entries.position (la actualizan las sesiones), comparada contra
// las páginas de la edición del pase — o la primaria si el pase no tiene una
// asignada todavía.
function ProgressBlock({
  itemType,
  itemId,
  entry,
  openPass,
  openPassEdition,
  editions,
}: {
  itemType: ItemType;
  itemId: string;
  entry: { entryId: string; position: Position };
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

  let page: number | undefined;
  if (itemType === "book" && "page" in entry.position && entry.position.page !== undefined) {
    page = entry.position.page;
  }
  const totalPages = itemType === "book" ? (openPassEdition?.totalUnits ?? null) : null;

  return (
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
                    setPassEdition(openPass.id, itemType, itemId, edition.id)
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
            startTransition(() => ratePass(openPass.id, itemType, itemId, next));
          }}
          size="sm"
        />
      </div>

      {page !== undefined && (
        <p className="text-xs text-muted-foreground">
          {totalPages !== null ? t("page", { page, total: totalPages }) : t("pageOnly", { page })}
        </p>
      )}

      {/* Las series no tienen ediciones: sin selector para ellas. Mientras la
          pregunta pendiente de arriba está sin contestar, no repetimos el
          mismo selector aquí abajo. */}
      {itemType !== "series" && editions.length > 0 && !pendingEditionQuestion && (
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
                setPassEdition(openPass.id, itemType, itemId, next)
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

      {/* Las películas no tienen sesiones (§7.14 scope decision). */}
      {itemType !== "movie" && (
        <Link
          href={`/sesion/${entry.entryId}`}
          className="self-start text-xs text-muted-foreground underline hover:text-foreground"
        >
          {tSessions("add")}
        </Link>
      )}
    </div>
  );
}
