import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { isSagaAccentToken } from "@/lib/sagas/accents";
import { RouteEditor, type RouteEditorItem } from "@/components/saga/editor/route-editor";

export const metadata: Metadata = { title: "Editar itinerario — Biblioshare" };

// Editor de pasos de un itinerario. Gate DURO collaborator+, igual que
// /saga/[id]/editar.
export default async function RouteEditorPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const supabase = await createClient();

  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/saga/${id}/rutas/${slug}/editar`));
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

  // Acento y recuento de cada bloque-subsaga: mismo criterio de resolución
  // que route-view.tsx (si la subsaga tiene grupo en la ficha, ese acento
  // manda; si no tiene grupo — sin miembros, la rotación de groupMembers no
  // la cubre —, su accent_color persistido si es válido, o beige).
  const groupAccentBySagaId = new Map(
    detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.accent] as const] : [])),
  );
  const groupMemberCountBySagaId = new Map(
    detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.members.length] as const] : [])),
  );

  const palette: RouteEditorItem[] = [
    ...detail.childRefs.map((c) => ({
      key: `s:${c.id}`,
      label: c.name,
      coverUrl: null,
      itemType: null,
      role: null,
      accent: groupAccentBySagaId.get(c.id) ?? (isSagaAccentToken(c.accentColor) ? c.accentColor : "beige"),
      memberCount: groupMemberCountBySagaId.get(c.id) ?? 0,
      entry: { itemType: null, itemId: null, childSagaId: c.id, note: null },
    })),
    ...detail.groups.flatMap((g) =>
      g.members.map((m) => ({
        key: `i:${m.itemType}:${m.itemId}`,
        label: m.title,
        coverUrl: m.coverUrl,
        itemType: m.itemType,
        role: m.role,
        accent: null,
        memberCount: null,
        entry: { itemType: m.itemType, itemId: m.itemId, childSagaId: null, note: null },
      })),
    ),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-none lg:p-0">
      <RouteEditor
        routeId={route.id}
        routeName={route.name}
        sagaId={id}
        sagaName={detail.saga.name}
        descendantIds={descendantIds}
        initialEntries={entries}
        palette={palette}
      />
    </div>
  );
}
