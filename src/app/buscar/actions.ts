"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { applyTransition } from "@/lib/passes/apply-transition";
import { notifyAdded } from "@/lib/social/notify-followers";
import { ensureBookHydrated } from "@/lib/catalog/hydrate-book";
import { itemHref } from "@/lib/catalog/item-href";
import { loginHref } from "@/lib/auth/safe-next";
import { settledWithin } from "@/lib/async/settled-within";
import type { SearchResult } from "@/lib/catalog/types";

// Presupuesto de la hidratación antes de navegar. No es un timeout de la
// llamada: es cuánto está dispuesto el usuario a mirar una pantalla congelada.
const HYDRATION_BUDGET_MS = 1200;

// Abrir la ficha de un resultado que TODAVÍA no está en el catálogo: la búsqueda
// ya no persiste nada (§7.32), así que un resultado de la API llega sin
// catalogId y no hay ficha a la que enlazar hasta que la obra existe. Aquí es
// donde nace: el usuario ha hecho clic, es decir, se ha comprometido con el
// libro. La hidratación se intenta aquí con un presupuesto corto y, si no llega
// a tiempo, se termina en segundo plano (ver HYDRATION_BUDGET_MS arriba).
export async function openCatalogItem(result: SearchResult) {
  if (result.catalogId) redirect(itemHref(result.itemType, result.catalogId));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Crear catálogo exige sesión (RLS). Un visitante anónimo solo puede abrir lo
  // que ya está cacheado; para lo demás, pasa por el login y vuelve a la
  // búsqueda tras entrar (el ítem aún no existe, así que no hay ficha a la que
  // devolverle; que reabra el resultado ya con sesión).
  if (!user) redirect(loginHref("/buscar"));

  const itemId = await findOrCreateCatalogItem(supabase, result, user.id);

  if (result.itemType === "book") {
    // La hidratación pega a OpenLibrary, y sus DOS llamadas tienen 5 s de
    // timeout cada una (work-detail.ts): esperarla entera aquí dejaba el clic
    // en el resultado congelado hasta ~10 s, con la pantalla de búsqueda
    // intacta y sin más aviso que la tarjeta atenuada. Se le da un presupuesto
    // corto: si OpenLibrary responde rápido (lo normal), la ficha nace ya con
    // su sinopsis y sus géneros; si no, se navega igual y el trabajo sigue vivo
    // en after(), así que la ficha lo tendrá en el siguiente pintado. La red de
    // seguridad final es el curador de la propia ficha (after() en
    // libro/[id]/page.tsx), que rehidrata cualquier fila con hydrated_at null
    // la próxima vez que se abra. Nunca lanza.
    const hydration = ensureBookHydrated(supabase, {
      id: itemId,
      openlibrary_work_key: result.externalId,
      isbn: result.matchedIsbn ?? null,
      hydrated_at: null,
    });
    if (!(await settledWithin(hydration, HYDRATION_BUDGET_MS))) {
      after(() => hydration);
    }
  }

  redirect(itemHref(result.itemType, itemId));
}

export async function addToLibrary(result: SearchResult) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginHref("/buscar"));

  // La búsqueda ya NO persiste los resultados de la API (§7.32): un resultado
  // que no venía del catálogo local llega sin catalogId, y la fila nace aquí,
  // que es cuando el usuario se compromete con el ítem.
  const itemId =
    result.catalogId ?? (await findOrCreateCatalogItem(supabase, result, user.id));

  // Alta = pase activo en planned vía la máquina; si ya estaba en la
  // biblioteca (pase activo existente), la transición es un no-op.
  const outcome = await applyTransition(supabase, user.id, result.itemType, itemId, "planned");
  await notifyAdded(supabase, user.id, outcome);

  revalidatePath("/buscar");
}
