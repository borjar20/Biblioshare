import { SkeletonLine } from "@/components/ui/skeleton";

// Fila de pestañas + un bloque de contenido, fantasma. Es el fallback del
// <Suspense> que envuelve las pestañas en las fichas: el hero ya está pintado
// con los datos de la obra y solo falta que lleguen créditos, ediciones, pases…
//
// Las fichas NO llevan `loading.tsx`: son rutas que pueden hacer notFound(), y
// una frontera de Suspense a nivel de ruta arranca el streaming y compromete un
// 200, con lo que el 404 real se perdería (contrato HTTP, guía de streaming de
// Next). El hero sale de consultas rápidas y el contenido sigue llegando por
// streaming gracias a este boundary, así que no hace falta.
export function ItemTabsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-14" />
        <SkeletonLine className="w-20" />
        <SkeletonLine className="w-16" />
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-5/6" />
        <SkeletonLine className="w-2/3" />
      </div>
    </div>
  );
}
