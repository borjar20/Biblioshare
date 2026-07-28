"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteRoute, moveRoute, setReadingOrder } from "@/lib/sagas/route-actions";
import { ShellDesktop } from "./shell-desktop";
import { ShellMobile } from "./shell-mobile";
import { RouteFormSheet, RouteSheet } from "./route-sheet";
import type { RouteRowData } from "./route-row";

type SheetState =
  | { kind: "menu"; routeId: string }
  | { kind: "create" }
  | { kind: "rename"; routeId: string }
  | null;

/** Único dueño del estado de esta pantalla. Las dos cáscaras se montan a la vez
 *  y se ocultan por breakpoint (regla de los dos árboles): son dos árboles de
 *  PRESENTACIÓN con un solo estado, como `sequence-editor.tsx`. Duplicar el
 *  estado por cáscara es el fallo que esa regla avisa que el patrón no cubre.
 *
 *  Las hojas se montan AQUÍ, fuera de las cáscaras: un `<dialog>` dentro de un
 *  contenedor con `display:none` no se pinta, así que una hoja dentro de la
 *  cáscara móvil no aparecería nunca en escritorio. */
export function RoutesManager({
  sagaId,
  sagaName,
  hasMap,
  rows,
}: {
  sagaId: string;
  sagaName: string;
  hasMap: boolean;
  rows: RouteRowData[];
}) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);
  // `busyId` es el id de la fila con una acción en vuelo, o "*" cuando la
  // acción no es de ninguna fila concreta (designar el mapa generado toca a
  // todas). Deshabilitar solo lo afectado evita el spinner global.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [, startTransition] = useTransition();

  // El designado está fijado arriba por su designación, no por su `position`:
  // queda fuera de la lista movible y sus vecinas calculan los extremos sobre
  // esa sublista.
  const movableIds = rows.filter((r) => !r.isReadingOrder).map((r) => r.id);

  function run(id: string, fn: () => Promise<string | null>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const err = await fn();
      setBusyId(null);
      if (err) setError(err);
      else router.refresh();
    });
  }

  const onMove = (routeId: string, direction: "up" | "down") =>
    run(routeId, async () => {
      await moveRoute(routeId, sagaId, direction);
      return null;
    });

  const onDesignate = (routeId: string | null) =>
    run(routeId ?? "*", async () => {
      const result = await setReadingOrder(sagaId, routeId);
      if (!result.error) setSheet(null);
      return result.error ?? null;
    });

  const active = sheet && sheet.kind !== "create" ? rows.find((r) => r.id === sheet.routeId) ?? null : null;

  function onDelete(routeId: string) {
    setDeleteError(false);
    setBusyId(routeId);
    startTransition(async () => {
      const result = await deleteRoute(routeId, sagaId);
      setBusyId(null);
      if (result.error) {
        setDeleteError(true);
        return;
      }
      setSheet(null);
      router.refresh();
    });
  }

  const shellProps = {
    sagaId,
    sagaName,
    hasMap,
    rows,
    movableIds,
    busyId,
    error,
    onMove,
    onDesignate,
    onMenu: (routeId: string) => {
      setDeleteError(false);
      setSheet({ kind: "menu", routeId });
    },
    onCreate: () => setSheet({ kind: "create" }),
  };

  return (
    <>
      <div className="hidden lg:block">
        <ShellDesktop {...shellProps} />
      </div>
      <div className="lg:hidden">
        <ShellMobile {...shellProps} />
      </div>

      {sheet?.kind === "menu" && active && (
        <RouteSheet
          row={active}
          sagaId={sagaId}
          busy={busyId !== null}
          onRename={() => setSheet({ kind: "rename", routeId: active.id })}
          onDesignate={() => onDesignate(active.id)}
          onDelete={() => onDelete(active.id)}
          deleting={busyId === active.id}
          deleteError={deleteError}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === "rename" && active && (
        <RouteFormSheet
          title={t("routeRenameTitle")}
          sagaId={sagaId}
          route={{ id: active.id, name: active.name, summary: active.summary }}
          onClose={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      )}

      {sheet?.kind === "create" && (
        <RouteFormSheet
          title={t("routeNewTitle")}
          sagaId={sagaId}
          route={null}
          onClose={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
