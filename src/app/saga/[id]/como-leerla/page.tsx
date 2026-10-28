import { Suspense } from "react";
import { redirect } from "next/navigation";
import { sagaAtlasHref } from "@/lib/catalog/item-href";
import { AtlasSkeleton } from "@/components/saga/atlas/atlas-skeleton";

type ReadingRedirectProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// «Cómo leerla» fue la página interina de la ficha (spec 2026-10-27 §5). El atlas
// (spec 2026-10-28) la sustituye: redirect con los mismos parámetros, que
// `/mapa` traduce (?ruta=publicacion → lente, ?rol= → lente rol).
// Shell síncrono con el fantasma del atlas, como /mapa: leer `params` o
// `searchParams` fuera de <Suspense> bloquea la navegación con Cache Components.
export default function SagaReadingRedirectPage(props: ReadingRedirectProps) {
  return (
    <Suspense fallback={<AtlasSkeleton />}>
      <SagaReadingRedirect {...props} />
    </Suspense>
  );
}

async function SagaReadingRedirect({ params, searchParams }: ReadingRedirectProps): Promise<never> {
  const { id } = await params;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  const qs = q.toString();
  redirect(qs ? `${sagaAtlasHref(id)}?${qs}` : sagaAtlasHref(id));
}
