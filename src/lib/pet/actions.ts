"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePetPage } from "@/lib/reactivity/revalidate";
import { isPetClass, NAME_MAX } from "./classes";
import { deriveAttributes, levelFor, xpFor } from "./derive";
import { getPetCounts } from "./get-pet-counts";

export type PetActionState = {
  error?: "invalidName" | "invalidClass" | "exists" | "generic";
};

// Se recorta y se colapsan espacios: "  Nuez  " es "Nuez". El límite (NAME_MAX)
// vive en classes.ts: este módulo es "use server" y solo puede exportar
// funciones async, así que una constante aquí rompe la build.
function parseName(raw: FormDataEntryValue | null): string | null {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > NAME_MAX) return null;
  return name;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Eclosión (spec §1, §7): nombre + clase. Una sola vez: si ya hay fila, `exists`. */
export async function hatchPet(_prev: PetActionState, formData: FormData): Promise<PetActionState> {
  const { supabase, user } = await requireUser();
  const name = parseName(formData.get("name"));
  if (!name) return { error: "invalidName" };
  const cls = formData.get("class");
  if (!isPetClass(cls)) return { error: "invalidClass" };

  // last_level nace con el nivel REAL, no con 1: quien eclosiona con historial
  // (un import de 150 lecturas) ya está en nivel ~10, y si last_level fuera 1
  // la primera visita a /mascota lo celebraría como una subida de nivel de
  // golpe (issue #1042). La etapa sí nace en `acorn`: hasta la primera
  // actividad tras eclosionar no sale de la bellota, y ESA evolución sí se
  // celebra. Si contar falla NO se eclosiona con nivel 1: quedaría guardado y
  // la siguiente visita celebraría la subida de golpe igual; mejor "inténtalo
  // otra vez" (la misma lectura la haría /mascota justo después).
  let level: number;
  try {
    const { counts } = await getPetCounts(supabase, user.id);
    level = levelFor(xpFor(deriveAttributes(counts), cls));
  } catch (e) {
    console.error("hatchPet counts", e);
    return { error: "generic" };
  }
  const { error } = await supabase
    .from("pet_state")
    .insert({ user_id: user.id, name, class: cls, last_level: level });
  if (error) {
    // 23505 = unique_violation sobre la PK: ya había mascota.
    if (error.code === "23505") return { error: "exists" };
    console.error("hatchPet", error);
    return { error: "generic" };
  }
  revalidatePetPage();
  return {};
}

export async function renamePet(_prev: PetActionState, formData: FormData): Promise<PetActionState> {
  const { supabase, user } = await requireUser();
  const name = parseName(formData.get("name"));
  if (!name) return { error: "invalidName" };
  const { error } = await supabase
    .from("pet_state")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: "generic" };
  revalidatePetPage();
  return {};
}

/** Cambia bonus y look; los atributos son derivados, no hay nada que perder (§2). */
export async function changeClass(cls: string): Promise<PetActionState> {
  if (!isPetClass(cls)) return { error: "invalidClass" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("pet_state")
    .update({ class: cls, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: "generic" };
  revalidatePetPage();
  return {};
}

/** Preferencia en BD, no en localStorage: cruza dispositivos (#460). */
export async function setCompanionHidden(value: boolean): Promise<PetActionState> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("pet_state")
    .update({ companion_hidden: value, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: "generic" };
  revalidatePetPage();
  return {};
}
