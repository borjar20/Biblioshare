import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { RouteEditor, type RouteEditorItem } from "@/components/saga/editor/route-editor";

export const metadata: Metadata = { title: "Editar itinerario — Biblioshare" };

// Editor de pasos de un itinerario. Gate DURO collaborator+, igual que
// /saga/[id]/mapa/editar.
export default async function RouteEditorPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${id}`);

  const { data: route } = await supabase
    .from("saga_routes")
    .select("id, name")
    .eq("saga_id", id)
    .eq("slug", slug)
    .maybeSingle();
  if (!route) notFound();

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  const entries = await getRouteEntries(supabase, route.id);

  // Paleta y "¿es descendiente de esta saga?" salen de detail.childRefs —
  // TODOS los descendientes, tengan o no miembros—, no de detail.groups.
  // groupMembers solo crea grupo para una hija con al menos un miembro
  // (comentario en get-saga-detail.ts / hallazgo 2 de la Task 6): si la
  // paleta o descendantIds salieran de `groups`, una subsaga vacía sería
  // indistinguible de una borrada, desaparecería como opción de bloque, y
  // validateRouteDraft rechazaría como "foreignBlock" un bloque legítimo a
  // esa subsaga si ya estuviera guardado en un itinerario existente.
  const descendantIds = detail.childRefs.map((c) => c.id);
  const palette: RouteEditorItem[] = [
    ...detail.childRefs.map((c) => ({
      key: `s:${c.id}`,
      label: c.name,
      entry: { itemType: null, itemId: null, childSagaId: c.id, note: null },
    })),
    ...detail.groups.flatMap((g) =>
      g.members.map((m) => ({
        key: `i:${m.itemType}:${m.itemId}`,
        label: m.title,
        entry: { itemType: m.itemType, itemId: m.itemId, childSagaId: null, note: null },
      })),
    ),
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-lg font-semibold">{route.name}</h1>
      <RouteEditor
        routeId={route.id}
        sagaId={id}
        descendantIds={descendantIds}
        initialEntries={entries}
        palette={palette}
      />
    </div>
  );
}
