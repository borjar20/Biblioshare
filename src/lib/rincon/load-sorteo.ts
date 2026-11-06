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
// La mascota es opcional: si su lectura falla o la compañera está oculta, habla el narrador.
export async function loadSorteo(): Promise<SorteoLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("loadSorteo: sin sesión");
  const [pool, companion] = await Promise.all([
    getSorteoPool(supabase, user.id),
    getCompanionState(supabase).catch(() => null),
  ]);
  const pet =
    companion && !companion.hidden
      ? { name: companion.name, petClass: companion.petClass, stage: companion.stage }
      : null;
  return { ...pool, pet };
}
