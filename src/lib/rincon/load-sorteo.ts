"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanionState } from "@/lib/pet/get-companion-state";
import type { PetClass, PetStage } from "@/lib/pet/classes";
import { getSorteoPool } from "./get-sorteo-pool";
import type { SorteoCollection, SorteoItem } from "@/components/rincon/sorteo-logic";

export type SorteoPet = { name: string; petClass: PetClass; stage: PetStage };
export type SorteoLoad = { items: SorteoItem[]; collections: SorteoCollection[]; pet: SorteoPet | null };

// Se llama al abrir la partida (spec «Arquitectura»): el telón tapa la espera.
// SIN `use cache` (regla #437): el pool sale de RLS con auth.uid(), es del que mira.
// La mascota es opcional: si no hay mascota o su lectura falla, habla el narrador.
// `companion_hidden` NO cuenta: oculta la compañera flotante del shell, no la
// mascota de la partida (con el filtro, quien la ocultaba se quedaba sin ella aquí).
export async function loadSorteo(): Promise<SorteoLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("loadSorteo: sin sesión");
  const [pool, companion] = await Promise.all([
    getSorteoPool(supabase, user.id),
    getCompanionState(supabase).catch((e) => {
      console.error("loadSorteo: companion", e);
      return null;
    }),
  ]);
  const pet = companion ? { name: companion.name, petClass: companion.petClass, stage: companion.stage } : null;
  return { ...pool, pet };
}
