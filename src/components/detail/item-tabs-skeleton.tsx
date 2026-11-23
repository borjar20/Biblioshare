import type { ReactNode } from "react";
import { SkeletonLine } from "@/components/ui/skeleton";
import { DETAIL_CONTAINER } from "./detail-container";

// Fila de pestañas + un bloque de contenido, fantasma. Es el fallback del
// <Suspense> INTERNO que envuelve las pestañas: cuando el hero ya está pintado
// con los datos de la obra y solo falta que lleguen créditos, ediciones, pases…
//
// Nota de contrato HTTP: hasta #442 las fichas evitaban a propósito cualquier
// frontera de Suspense a nivel de RUTA (ni `loading.tsx` ni un boundary que
// envolviera todo), porque arranca el streaming y compromete un 200, con lo que
// el 404 de un id inexistente se perdería. Desde #442 sí hay un <Suspense> de
// página (el hero streamea tras `ItemShellSkeleton` para desatar el shell
// estático), así que ese 404 pasó a ser un 200 + la UI de `not-found.tsx`: es un
// compromiso ACEPTADO a cambio de la navegación instantánea (decisión
// 2026-08-05 en `decisiones.md`). Este boundary interno de pestañas sigue tal
// cual, por debajo del de página.
export function ItemTabsSkeleton({ passCard }: { passCard?: ReactNode }) {
  return (
    <div className={`${DETAIL_CONTAINER} py-8`}>
      <div className="hidden gap-6 lg:flex border-b border-border pb-3">
        <SkeletonLine className="w-14" />
        <SkeletonLine className="w-20" />
      </div>
      <div className="mt-6 flex flex-col gap-7 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(250px,36%)]">
        {passCard && <div className="xl:col-start-2 xl:row-start-1">{passCard}</div>}
        <div className="flex flex-col gap-3 xl:col-start-1 xl:row-start-1">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-5/6" />
          <SkeletonLine className="w-2/3" />
        </div>
      </div>
    </div>
  );
}
