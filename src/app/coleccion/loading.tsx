import { SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { SHELL_GRID } from "@/lib/ui/layout";

// Skeleton de /coleccion: SOLO lo que no depende de la subpestaña — título y
// subpestañas.
//
// Antes pintaba además la rejilla de `Colecciones`, el tab por defecto. Pero
// `loading.tsx` no recibe `searchParams`, así que al entrar directo en
// `?tab=todo` enseñaba la forma equivocada —tarjetas grandes de colección donde
// venían portadas— (issue #373). Adivinar el tab por defecto acierta en un
// caso y falla en los otros dos.
//
// El cuerpo ya tiene sus propios <Suspense> DENTRO de page.tsx, y esos sí saben
// qué pestaña es: cada uno pinta su skeleton correcto. Aquí sobra repetirlo.
//
// El ancho SÍ se cerró del todo: `page.tsx` unificó las tres pestañas a un
// único `SHELL_GRID` (antes `Colecciones` tenía su propio `SHELL_TILES`), así
// que ya no hace falta adivinar por pestaña — este skeleton usa el mismo
// ancho que CUALQUIERA de las tres. Si `page.tsx` vuelve a diferenciar el
// ancho por pestaña, este fichero se desincroniza otra vez.
export default function Loading() {
  return (
    <div
      className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}
    >
      <LoadingAnnounce />
      <SkeletonLine className="h-7 w-40" />

      {/* Subpestañas */}
      <div className="flex gap-6 border-b border-border pb-3">
        {["w-24", "w-14"].map((w) => (
          <SkeletonLine key={w} className={w} />
        ))}
      </div>
    </div>
  );
}
