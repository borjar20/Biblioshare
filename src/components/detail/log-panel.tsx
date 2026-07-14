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
  const t = useTranslations("item");
  const [isPending, startTransition] = useTransition();

  if (!entry) {
    return (
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => addExistingItemToLibrary(itemType, itemId))
        }
      >
        {isPending ? t("following") : t("follow")}
      </Button>
    );
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
        <ProgressBlock
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
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(openPass.rating);

  // Resync tras revalidación (p. ej. otra pestaña cambió la nota o la
  // edición del pase). Mismo patrón "ajuste durante el render" de arriba.
  const [prevOpenPass, setPrevOpenPass] = useState(openPass);
  if (openPass !== prevOpenPass) {
    setPrevOpenPass(openPass);
    if (openPass.rating !== rating) setRating(openPass.rating);
  }

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

      {/* Las series no tienen ediciones: sin selector para ellas. */}
      {itemType !== "series" && editions.length > 0 && (
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
