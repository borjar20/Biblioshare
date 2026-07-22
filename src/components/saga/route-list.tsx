"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { deleteRoute, moveRoute, renameRoute, type RouteFormState } from "@/lib/sagas/route-actions";
import { compareRoutePosition, type CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
import { sagaHref } from "@/lib/catalog/item-href";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialRenameState: RouteFormState = {};

// Lista de itinerarios curados en /saga/[id]/rutas (brecha de spec
// 2026-07-22, Task 8): renombrar, reordenar y borrar-con-confirmación, que
// faltaban junto a crear/listar/borrar-sin-confirmar. Cliente porque las tres
// necesitan estado local (fila en edición, confirmación de borrado en dos
// pasos, pending de cada transición) que un componente servidor no puede
// llevar; page.tsx sigue siendo servidor y solo pasa `routes` ya resueltas.
export function RouteList({ sagaId, routes }: { sagaId: string; routes: CuratedRouteRow[] }) {
  // Mismo criterio de orden que ve el lector en el selector (buildRouteList):
  // así "subir/bajar" aquí coincide siempre con lo que se ve en la ficha.
  const ordered = [...routes].sort(compareRoutePosition);

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((route, index) => (
        <RouteRow
          key={route.id}
          sagaId={sagaId}
          route={route}
          isFirst={index === 0}
          isLast={index === ordered.length - 1}
        />
      ))}
    </ul>
  );
}

function RouteRow({
  sagaId,
  route,
  isFirst,
  isLast,
}: {
  sagaId: string;
  route: CuratedRouteRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();

  // Renombrar: form + useActionState, mismo patrón que CreateRouteForm. El
  // slug nunca viaja en este form porque renameRoute no lo toca (decisión
  // documentada en route-actions.ts). Se envuelve la action para cerrar el
  // formulario en cuanto el submit termina sin error, sin depender de un
  // efecto que compare estado anterior/nuevo.
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState(
    async (prev: RouteFormState, formData: FormData) => {
      const result = await renameRoute(route.id, sagaId, prev, formData);
      if (!result.error) setEditing(false);
      return result;
    },
    initialRenameState,
  );

  // Mover: acción inmediata (sin form), igual que universo padre/portada en
  // SagaMetaEditor. moveRoute no devuelve estado de error: es una operación
  // de bajo riesgo (no destructiva, no pierde datos) y router.refresh() deja
  // ver siempre el orden real de BD tras el intento.
  const [movePending, startMoveTransition] = useTransition();
  function move(direction: "up" | "down") {
    startMoveTransition(async () => {
      await moveRoute(route.id, sagaId, direction);
      router.refresh();
    });
  }

  // Borrar: confirmación en dos pasos calcada de la zona de peligro de
  // SagaMetaEditor (src/components/saga/saga-meta-editor.tsx) — mismo tipo de
  // borrado destructivo en cascada (se lleva los pasos del itinerario vía
  // `on delete cascade` de saga_route_entries.route_id).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  function handleDelete() {
    setDeleteError(false);
    startDeleteTransition(async () => {
      const result = await deleteRoute(route.id, sagaId);
      if (result.error) setDeleteError(true);
      else router.refresh();
    });
  }

  const busy = movePending || deletePending;

  if (editing) {
    return (
      <li className="rounded-xl border border-border px-3 py-2">
        <form action={renameAction} className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-muted-foreground" htmlFor={`route-name-${route.id}`}>
            {t("routeNameLabel")}
          </label>
          <Input id={`route-name-${route.id}`} name="name" required maxLength={80} defaultValue={route.name} />
          <label className="text-[11px] font-semibold text-muted-foreground" htmlFor={`route-summary-${route.id}`}>
            {t("routeSummaryLabel")}
          </label>
          <Input
            id={`route-summary-${route.id}`}
            name="summary"
            maxLength={280}
            defaultValue={route.summary ?? ""}
          />
          <div className="flex gap-2 self-end">
            <Button type="button" variant="secondary" disabled={renamePending} onClick={() => setEditing(false)}>
              {t("routeCancel")}
            </Button>
            <Button type="submit" disabled={renamePending}>
              {renamePending ? t("routeSaving") : t("routeSave")}
            </Button>
          </div>
          {renameState.error && (
            <p className="text-xs text-status-dropped">{t(`routeErrors.${renameState.error}`)}</p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            disabled={busy || isFirst}
            onClick={() => move("up")}
            aria-label={t("routeMoveUp")}
            className="leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={busy || isLast}
            onClick={() => move("down")}
            aria-label={t("routeMoveDown")}
            className="leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ↓
          </button>
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{route.name}</span>
          {route.summary && <span className="block truncate text-[11px] text-muted-foreground">{route.summary}</span>}
        </span>
        <Link
          href={`${sagaHref(sagaId)}/rutas/${route.slug}/editar`}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
        >
          {t("routeEditSteps")}
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="shrink-0 px-2 py-1 text-[11px] text-muted-foreground disabled:opacity-40"
        >
          {t("routeRename")}
        </button>
        {!confirmingDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="shrink-0 px-2 py-1 text-[11px] text-status-dropped disabled:opacity-40"
          >
            {t("routeDelete")}
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div className="flex flex-col gap-2 rounded-lg border border-status-dropped/40 p-2">
          <p className="text-[11px] text-muted-foreground">{t("routeDeleteWarning")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={deletePending} onClick={() => setConfirmingDelete(false)}>
              {t("routeCancel")}
            </Button>
            <button
              type="button"
              disabled={deletePending}
              onClick={handleDelete}
              className="rounded-full bg-status-dropped px-4 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
            >
              {deletePending ? t("routeDeleting") : t("routeDeleteConfirm")}
            </button>
          </div>
          {deleteError && <p className="text-xs text-status-dropped">{t("genericError")}</p>}
        </div>
      )}
    </li>
  );
}
