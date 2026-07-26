import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { isSagaAccentToken } from "@/lib/sagas/accents";
import { getSagaSequence } from "@/lib/sagas/get-saga-sequence";
import { getSagaRoutes } from "@/lib/sagas/get-saga-routes";
import { SagaMetaEditor } from "@/components/saga/saga-meta-editor";
import { SequenceEditor } from "@/components/saga/sequence/sequence-editor";
import { SequenceItineraries } from "@/components/saga/sequence/sequence-itineraries";

export const metadata: Metadata = { title: "Editar saga — Biblioshare" };

export default async function EditSagaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${id}`);

  const { data: saga } = await supabase
    .from("sagas")
    .select("id, name, overview, cover_url, accent_color, parent_saga_id")
    .eq("id", id)
    .maybeSingle();
  if (!saga) notFound();

  // Padre resuelto con una segunda consulta plana (patrón get-saga-detail.ts:301-302),
  // no con el self-join hint `sagas!sagas_parent_saga_id_fkey(...)`: PostgREST puede
  // resolver ambiguamente el embed de una FK que apunta a la misma tabla, y este
  // enfoque ya está probado en el repo — más simple y sin ese riesgo.
  const { data: parent } = saga.parent_saga_id
    ? await supabase.from("sagas").select("id, name").eq("id", saga.parent_saga_id).maybeSingle()
    : { data: null };

  // Sin caso null: la existencia de la saga ya se comprobó arriba con el
  // maybeSingle() sobre `sagas` + notFound(). Una saga real sin miembros ni
  // hijas (recién creada) es un estado legítimo, y su borrador vacío es
  // exactamente lo que getSagaSequence devuelve en ese caso (ver su cabecera).
  const sequence = await getSagaSequence(supabase, saga.id);
  const routes = await getSagaRoutes(supabase, saga.id);

  const t = await getTranslations("saga");
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6 lg:max-w-none lg:px-0">
      <div className="lg:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
        <SagaMetaEditor
          sagaId={saga.id}
          initial={{
            name: saga.name,
            overview: saga.overview,
            coverUrl: saga.cover_url,
            accent: isSagaAccentToken(saga.accent_color) ? saga.accent_color : null,
            parent,
          }}
        />
      </div>
      <SequenceEditor
        sagaId={saga.id}
        initial={sequence.draft}
        childSagas={sequence.childSagas}
        itineraries={<SequenceItineraries sagaId={saga.id} routes={routes} />}
      />
    </div>
  );
}
