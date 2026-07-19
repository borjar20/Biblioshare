"use server";

// Server actions de curación de sagas (spec fase 3.5): crear desde /sagas,
// anidar en universo, editar metadatos y cambiar la primary de un ítem. Gate
// collaborator+ en todas (patrón editor-actions/manage-saga-actions).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateItemPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { uploadPublicImage } from "@/lib/storage/upload-public-image";
import { SAGA_ACCENT, type SagaAccentToken } from "./accents";

export type CurationState = { error?: "forbidden" | "nameRequired" | "cycle" | "generic" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB, mismo límite que uploadCover de ítems
const COVER_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function requireCollaborator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { supabase: null } as const;
  }
  return { supabase } as const;
}

// El acento llega de un formulario (POST público): validar en runtime y
// rechazar beige, que está fuera de la paleta del editor (spec fase 3).
function parseAccent(raw: FormDataEntryValue | null): SagaAccentToken | null {
  const value = String(raw ?? "");
  if (value in SAGA_ACCENT && value !== "beige") return value as SagaAccentToken;
  return null;
}

export async function createSaga(_prev: CurationState, formData: FormData): Promise<CurationState> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };

  const { data, error } = await supabase
    .from("sagas")
    .insert({ name, source: "manual", accent_color: parseAccent(formData.get("accent")) })
    .select("id")
    .single();
  if (error || !data) return { error: "generic" };

  redirect(`/saga/${data.id}`);
}

// Cambia (o quita, con null) el universo padre de una saga. `newName` crea el
// universo en el mismo gesto, con buscar-o-crear homónimo case-insensitive
// (patrón assignItemToSaga). El trigger saga_parent_no_cycle protege en BD;
// capturamos su excepción como "cycle". Contrato: cuando se asigna padre,
// `parent.name` es SIEMPRE el nombre canónico en BD (nunca lo tecleado por el
// cliente) — necesario porque la rama "id existente" puede reutilizar una
// saga manual homónima cuyo nombre en BD difiere en mayúsculas/espacios del
// que el cliente tenía a mano.
export async function setParentSaga(
  sagaId: string,
  parent: { id: string } | { newName: string } | null,
): Promise<{ error?: string; parent?: { id: string; name: string } }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };

  let parentId: string | null = null;
  let parentName: string | null = null;
  if (parent && "id" in parent) {
    // No confiar en el nombre que trae el cliente (SagaPicker): puede haber
    // cambiado desde que se listó. Select barato para el nombre canónico.
    const { data: target, error: targetError } = await supabase
      .from("sagas")
      .select("id, name")
      .eq("id", parent.id)
      .maybeSingle();
    if (targetError || !target) return { error: "generic" };
    parentId = target.id;
    parentName = target.name;
  } else if (parent) {
    const name = parent.newName.trim();
    if (!name) return { error: "nameRequired" };
    const { data: existing } = await supabase
      .from("sagas")
      .select("id, name")
      .eq("source", "manual")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing) {
      parentId = existing.id;
      parentName = existing.name;
    } else {
      const { data: inserted, error } = await supabase
        .from("sagas")
        .insert({ name, source: "manual" })
        .select("id, name")
        .single();
      if (error || !inserted) return { error: "generic" };
      parentId = inserted.id;
      parentName = inserted.name;
    }
  }
  if (parentId === sagaId) return { error: "cycle" };

  const { error } = await supabase.from("sagas").update({ parent_saga_id: parentId }).eq("id", sagaId);
  if (error) return { error: error.message.includes("cycle") ? "cycle" : "generic" };

  revalidateSagaPage(sagaId);
  if (parentId) revalidateSagaPage(parentId);
  return { parent: parentId && parentName ? { id: parentId, name: parentName } : undefined };
}

// Promociona la membresía indicada a primary. Orden OBLIGADO por el índice
// parcial saga_items_primary_idx (UNIQUE una primary por ítem): comprobar que
// el destino existe → des-primariar la actual → promocionar. Sin la
// comprobación previa, un sagaId inexistente dejaría al ítem sin primary.
export async function setPrimarySaga(
  itemType: ItemType,
  itemId: string,
  sagaId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };

  const { data: target } = await supabase
    .from("saga_items")
    .select("saga_id")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("saga_id", sagaId)
    .maybeSingle();
  if (!target) return { error: "generic" };

  const { error: demoteError } = await supabase
    .from("saga_items")
    .update({ is_primary: false })
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("is_primary", true);
  if (demoteError) return { error: "generic" };

  const { error: promoteError } = await supabase
    .from("saga_items")
    .update({ is_primary: true })
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("saga_id", sagaId);
  if (promoteError) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateSagaPage(sagaId);
  return {};
}

export async function updateSagaMeta(
  sagaId: string,
  _prev: CurationState,
  formData: FormData,
): Promise<CurationState> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  if (!UUID_RE.test(sagaId)) return { error: "generic" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };
  const overviewRaw = String(formData.get("overview") ?? "").trim();

  const { error } = await supabase
    .from("sagas")
    .update({
      name,
      overview: overviewRaw || null,
      accent_color: parseAccent(formData.get("accent")),
    })
    .eq("id", sagaId);
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  return {};
}

// Borra la saga entera. La BD hace el resto en cascada (saga_items,
// saga_nodes, saga_edges, saga_follows); las SUBSAGAS no se borran: quedan
// como sagas raíz (parent_saga_id on delete set null). Los ítems de catálogo
// no se tocan. Vale para manuales y TMDB (una TMDB puede reaparecer por
// cache-as-you-go — aceptado en el spec post-v2 §3). Requiere la policy de
// DELETE de 20260719_sagas_delete_policy.sql: sin ella el DELETE afecta 0
// filas en silencio (no da error, sagas ya tenía SELECT/INSERT/UPDATE pero
// ninguna policy de DELETE).
export async function deleteSaga(sagaId: string): Promise<{ error?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  if (!UUID_RE.test(sagaId)) return { error: "generic" };

  const { data: existing } = await supabase
    .from("sagas")
    .select("id, parent_saga_id")
    .eq("id", sagaId)
    .maybeSingle();
  if (!existing) return { error: "generic" };

  // Capturar membresías, padre e hijas ANTES del delete: la cascada se lleva
  // las membresías de golpe y el set null desengancha a las hijas — sin este
  // snapshot no habría forma de saber qué fichas revalidar después (el padre
  // pierde un grupo/nodo; las hijas pierden su chip «Parte de»).
  const [{ data: members }, { data: childRows }] = await Promise.all([
    supabase.from("saga_items").select("item_type, item_id").eq("saga_id", sagaId),
    supabase.from("sagas").select("id").eq("parent_saga_id", sagaId),
  ]);

  const { error } = await supabase.from("sagas").delete().eq("id", sagaId);
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  if (existing.parent_saga_id) revalidateSagaPage(existing.parent_saga_id);
  for (const child of childRows ?? []) revalidateSagaPage(child.id);
  const seen = new Set<string>();
  for (const member of members ?? []) {
    const key = `${member.item_type}:${member.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    revalidateItemPage(member.item_type as ItemType, member.item_id);
  }
  redirect("/sagas");
}

// Portada de saga con service-role (Storage no valida ES256; misma razón y
// mismo bucket "covers" que uploadCover de ítems, bajo el prefijo sagas/).
// Se llama de forma DIRECTA desde el cliente (no via <form action>): validar
// sagaId en runtime porque construye el path del objeto.
export async function uploadSagaCover(
  sagaId: string,
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  if (!UUID_RE.test(sagaId)) return { error: "generic" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "generic" };
  if (!(file.type in COVER_EXTENSION)) return { error: "generic" };
  if (file.size > MAX_COVER_BYTES) return { error: "generic" };

  const path = `sagas/${sagaId}.${COVER_EXTENSION[file.type]}`;
  const result = await uploadPublicImage("covers", path, file, file.type);
  if ("error" in result) return { error: "generic" };

  const { error } = await supabase.from("sagas").update({ cover_url: result.url }).eq("id", sagaId);
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  return { url: result.url };
}
