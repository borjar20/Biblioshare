import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "./get-library-items";

// La cola de pendientes del Inicio, memoizada POR PETICIÓN: la piden el bloque
// de hoy y la tarjeta del Sorteo, y así va una sola consulta. Es `cache()` de
// React, no `use cache`: depende de la sesión y no se comparte entre cuentas
// (regla #437).
export const getPlannedItems = cache(async (userId: string) =>
  getLibraryItems(await createClient(), userId, { status: "planned" }),
);
