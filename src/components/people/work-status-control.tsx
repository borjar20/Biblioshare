"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import type { WorkStatus } from "@/lib/people/profile-types";
import { quickAddToLibrary } from "@/lib/library/quick-add-actions";
import { removeFromLibrary, updateStatus } from "@/lib/library/manage-actions";
import { ActionMenu } from "@/components/ui/action-menu";
import { AddToCollectionSheet } from "@/components/library/add-to-collection-sheet";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import { CheckIcon, ClockIcon, PlusIcon, StarIcon, XIcon } from "@/components/ui/icons";

export type WorkStatusLabels = {
  add: string;
  planned: string;
  inProgress: string;
  completed: string;
  dropped: string;
  menu: string;
  addToCollection: string;
  start: string;
  markDone: string;
  rate: string;
  remove: string;
};

/**
 * El control de estado de una fila de la filmografía. Sustituye al enlace
 * «Valorar» que había antes, que mentía por partida doble: aparecía igual en una
 * obra que no habías registrado (donde lo que quieres es meterla en la cola) y
 * desaparecía en cuanto la puntuabas, dejando la fila sin ninguna acción.
 *
 * Dice EN QUÉ ESTÁS y ofrece el paso siguiente, uno solo:
 *
 *   sin registro → «+ Pendiente»          · en curso  → «En curso» + por dónde vas
 *   pendiente    → «Pendiente»            · terminada → «Terminada» + tu nota
 *
 * Lo demás (colección, empezar, marcar terminada, quitar) baja al menú «⋯»: son
 * acciones legítimas pero no son la siguiente, y en cuarenta filas cada botón
 * extra es cuarenta botones.
 *
 * **Sin sesión no se pinta el menú, solo «+ Pendiente»**: la acción redirige a
 * `/login` desde el servidor, así que el botón sigue siendo honesto, pero un
 * menú de cuatro acciones que todas acaban en el login sería un cepo.
 */
export function WorkStatusControl({
  itemType,
  itemId,
  href,
  status,
  rating,
  progressLabel,
  progressPercent,
  loggedIn,
  labels,
}: {
  itemType: ItemType;
  itemId: string;
  /** La ficha de la obra: destino cuando hay que decidir algo que aquí no cabe. */
  href: string;
  status: WorkStatus | null;
  rating: number | null;
  progressLabel: string | null;
  progressPercent: number | null;
  loggedIn: boolean;
  labels: WorkStatusLabels;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  const statusLabel: Record<WorkStatus, string> = {
    planned: labels.planned,
    in_progress: labels.inProgress,
    completed: labels.completed,
    dropped: labels.dropped,
  };

  const menu = loggedIn && (
    <AddToCollectionSheet
      itemType={itemType}
      itemId={itemId}
      renderTrigger={(openCollections) => (
        <ActionMenu
          label={labels.menu}
          triggerClassName="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          items={[
            status !== null && {
              key: "collection",
              label: labels.addToCollection,
              icon: <PlusIcon className="h-4 w-4" />,
              onSelect: openCollections,
            },
            status !== "in_progress" && {
              key: "start",
              label: labels.start,
              icon: <ClockIcon className="h-4 w-4" />,
              onSelect: () =>
                run(async () => {
                  const outcome = await updateStatus(itemType, itemId, "in_progress");
                  // `askResume` = hay un pase CERRADO y hay que decidir
                  // continuar o reempezar. Esa decisión no cabe en una fila:
                  // se toma en la ficha, que es donde vive la hoja.
                  if (outcome.kind === "askResume") router.push(href);
                }),
            },
            status !== "completed" && {
              key: "done",
              label: labels.markDone,
              icon: <CheckIcon className="h-4 w-4" />,
              onSelect: () =>
                run(async () => {
                  const outcome = await updateStatus(itemType, itemId, "completed");
                  if (outcome.kind === "askResume") {
                    router.push(href);
                  } else if (outcome.closed) {
                    // Igual que marcar terminada EN LA FICHA: encadena la hoja
                    // de puntuar/reseñar, que se abre allí con `?cerrar=`.
                    router.push(`${href}?cerrar=${outcome.passId}&tab=log`);
                  }
                }),
            },
            status === "completed" &&
              rating === null && {
                key: "rate",
                label: labels.rate,
                icon: <StarIcon className="h-4 w-4" />,
                onSelect: () => router.push(`${href}?tab=log`),
              },
            status !== null && {
              key: "remove",
              label: labels.remove,
              icon: <XIcon className="h-4 w-4" />,
              danger: true,
              onSelect: () => run(() => removeFromLibrary(itemType, itemId)),
            },
          ]}
        />
      )}
    />
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid="work-status-control">
      {status === null ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await quickAddToLibrary(itemType, itemId);
              // Hay un pase cerrado: no se ha metido nada en la cola y la
              // decisión es suya. No cantamos «pendiente» — issue #299.
              if (result.kind === "askResume") router.push(href);
            })
          }
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" />
          {labels.add}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status={status} label={statusLabel[status]} />
          {status === "in_progress" && (progressLabel || progressPercent != null) && (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {[progressLabel, progressPercent != null ? `${progressPercent}%` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {status === "completed" && rating != null && (
            <RatingDots value={rating} size="sm" itemType={itemType} />
          )}
        </span>
      )}
      {menu}
    </div>
  );
}
