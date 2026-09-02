"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePetPage } from "@/lib/reactivity/revalidate";
import { isPetClass, NAME_MAX } from "./classes";

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

  const { error } = await supabase.from("pet_state").insert({ user_id: user.id, name, class: cls });
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
