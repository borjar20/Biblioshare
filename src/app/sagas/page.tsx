import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaIndexData } from "@/lib/sagas/get-saga-index";
import { SagasAtlas } from "@/components/sagas/atlas/sagas-atlas";
import { SagasAtlasSkeleton } from "@/components/sagas/atlas/sagas-atlas-skeleton";

export const metadata: Metadata = { title: "Sagas — Biblioshare" };

// Atlas de sagas y universos (spec 2026-10-28 índice). Sin `use cache` (regla #437): las
// tarjetas llevan seguidas, avance y colección del lector. Shell síncrono; la sesión se lee
// dentro del <Suspense> (Cache Components). La búsqueda NO filtra en el servidor: el atlas
// pinta el catálogo entero y atenúa en el cliente (`?q=` lo lee el componente).
export default function SagasIndexPage() {
  return (
    <Suspense fallback={<SagasAtlasSkeleton />}>
      <SagasAtlasContent />
    </Suspense>
  );
}

async function SagasAtlasContent() {
  const supabase = await createClient();
  // `""`: sin filtro de nombre en buildSagaIndex (solo filtra con una consulta no vacía).
  const data = await getSagaIndexData(supabase, "");
  return <SagasAtlas cards={data.cards} authenticated={data.isAuthenticated} canCurate={hasMinRole(data.viewerRole, "collaborator")} />;
}
