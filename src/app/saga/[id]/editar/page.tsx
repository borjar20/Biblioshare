import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { isSagaAccentToken } from "@/lib/sagas/accents";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { SagaMetaEditor } from "@/components/saga/saga-meta-editor";
import { SagaMembersEditor } from "@/components/saga/saga-members-editor";

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

  // OJO con la firma: es getSagaDetail(supabase, id) — el cliente va PRIMERO y
  // no recibe userId — y devuelve `SagaDetail | null`. La saga ya se comprobó
  // con el notFound() de arriba, pero el tipo obliga a estrecharlo igual.
  //
  // OJO con `m.ownerSagaId`: la fila real de `saga_items` que guarda
  // position/role vive en la saga DUEÑA de la membresía (DetailMember.ownerSagaId,
  // ver types.ts), NO en `g.sagaId` (el grupo VISUAL bajo el que se pinta:
  // hija DIRECTA del root, calculado en get-saga-detail.ts con directChildFor
  // subiendo por la cadena de padres). Ambos coinciden en profundidad 0 y 1,
  // pero divergen a partir de profundidad 2: un nieto se pinta agrupado bajo
  // la hija de nivel 1 (`g.sagaId`), aunque su fila real cuelgue más abajo.
  // Bindear el action con `g.sagaId ?? id` (como hacía un borrador anterior de
  // esta página) hace que guardar un miembro a esa profundidad falle en
  // silencio con `notMember`, porque el action busca la fila en el saga_id
  // equivocado — el MISMO fallo que esta pantalla vino a corregir, solo que
  // más adentro del árbol. Verificado contra la semilla QA: la mayoría de
  // miembros de "[QA Sagas v2] Universo" en realidad cuelgan de su subsaga
  // "Era Uno" (profundidad 1, donde `ownerSagaId` y `g.sagaId` sí coinciden).
  const detail = await getSagaDetail(supabase, id);
  const editableMembers = (detail?.groups ?? []).flatMap((g) =>
    g.members.map((m) => ({
      ownerSagaId: m.ownerSagaId,
      itemType: m.itemType,
      itemId: m.itemId,
      title: m.title,
      position: m.position,
      role: m.role,
    })),
  );

  const t = await getTranslations("saga");
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
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
      <SagaMembersEditor sagaId={saga.id} members={editableMembers} />
    </div>
  );
}
