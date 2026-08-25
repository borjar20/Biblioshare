"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { revalidateItemPage } from "@/lib/reactivity/revalidate";

export type CreateEditionState = {
  error?: "forbidden" | "invalidLabel" | "generic";
  // Al crear con éxito se devuelve el id: el selector de edición (frame 7,
  // "+ Es una edición nueva") elige la recién creada sin esperar a encontrarla
  // en la revalidación.
  ok?: true;
  editionId?: string;
};

function intOrNull(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Crear ediciones es curación del catálogo compartido → colaborador+, igual
// que asignar sagas (§7.35). RLS lo vuelve a comprobar; esto es para dar un
// mensaje decente en vez de un error genérico.
export async function createEdition(
  itemType: ItemType,
  itemId: string,
  _prev: CreateEditionState,
  formData: FormData
): Promise<CreateEditionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (itemType === "series") return { error: "forbidden" };
  if (!hasMinRole(await getCurrentUserRole(), "collaborator")) {
    return { error: "forbidden" };
  }

  const label = String(formData.get("label") ?? "").trim();
  if (!label || label.length > 60) return { error: "invalidLabel" };

  const { data: created, error } =
    itemType === "book"
      ? await supabase
          .from("book_editions")
          .insert({
            book_id: itemId,
            label,
            publisher: String(formData.get("publisher") ?? "").trim() || null,
            published_year: intOrNull(formData.get("year")),
            language: String(formData.get("language") ?? "").trim() || null,
            total_pages: intOrNull(formData.get("totalUnits")),
            isbn: String(formData.get("isbn") ?? "").trim() || null,
            created_by: user.id,
          })
          .select("id")
          .single()
      : await supabase
          .from("movie_versions")
          .insert({
            movie_id: itemId,
            label,
            release_year: intOrNull(formData.get("year")),
            duration_minutes: intOrNull(formData.get("totalUnits")),
            created_by: user.id,
          })
          .select("id")
          .single();

  if (error || !created) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  return { ok: true, editionId: created.id };
}
