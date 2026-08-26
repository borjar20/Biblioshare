// Línea base de la semilla QA de sagas y su restauración (issue #215).
//
// El problema medido no era solo el paralelismo (la config ya corre con
// `workers: 1`): cada spec lee su estado de partida al empezar y lo restaura al
// acabar, así que **si arranca sobre una semilla ya sucia, restaura la
// suciedad**. Un spec que muere a mitad deja su `finally` sin correr y
// contamina al siguiente, y esa deriva sobrevive entre sesiones. Reimponer la
// línea base ANTES de la suite cierra las dos causas a la vez.
//
// Los valores salen de lo que documenta `e2e/sagas-ventanas.spec.ts` y de la
// tabla de la #215, verificados con `SELECT` contra dev el 2026-07-28.

export const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
export const NIETA_ID = "02484dc9-9885-4627-9176-912ac45f85e0"; // [QA Sagas v2] Nieta

/** Las 4 obras directas de Era Uno, en su orden curado. Todas `fijo`,
 *  `optional = false` y `role = null`: cualquier spec que toque uno de esos
 *  tres campos (sagas-rol-narrativo toca `role`; sagas-colocacion-opcionalidad
 *  toca `optional` y `placement`) queda revertido por esto. */
export const ERA_UNO_BASELINE = [
  { itemId: "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a", title: "Rayuela", position: 1 },
  { itemId: "4c076a65-4888-4715-913e-2157374cd227", title: "Libro sin valorar", position: 2 },
  { itemId: "d6d61eab-6ef4-4691-a8f0-b89068508fd4", title: "Libro raro sin match", position: 3 },
  { itemId: "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc", title: "Para leer a Isabel Allende", position: 4 },
] as const;

/** Nieta es el ÚLTIMO hueco de Era Uno: su `position_in_parent` se mueve sola
 *  cuando un spec saca una obra de la secuencia (5 → 4). */
export const NIETA_BASELINE = { position_in_parent: 5, placement_in_parent: "fijo" } as const;

/** No hay ventana en la línea base: `sagas-ventanas.spec.ts` documenta
 *  `saga_placement_windows` vacía para Era Uno. */

// El entorno se lee DENTRO de las funciones, no en el módulo: `playwright.config.ts`
// carga `.env.local` a mano al evaluarse, y leerlo arriba acopla este fichero al
// orden en que Playwright importa los módulos.
export function serviceEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[qa-seed] faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, key };
}

async function api(path: string, init?: RequestInit) {
  const { url, key } = serviceEnv();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`[qa-seed] ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

/** Guarda de seguridad: esto escribe con la SERVICE KEY, así que antes de tocar
 *  nada comprueba que el UUID que va a modificar SIGUE siendo la saga QA. Si
 *  alguien apunta `.env.local` a otro proyecto, o si el seed se renombra, aborta
 *  en vez de pisar datos reales. Es una comprobación de DATO, no de entorno:
 *  funciona igual apuntando a donde apunte. */
export async function assertQaUniverse() {
  const rows = (await (await api(`sagas?id=eq.${ERA_UNO_ID}&select=name`)).json()) as Array<{ name: string }>;
  if (rows[0]?.name !== "[QA Sagas v2] Era Uno") {
    throw new Error(
      `[qa-seed] ABORTADO: ${ERA_UNO_ID} no es "[QA Sagas v2] Era Uno" (es ${JSON.stringify(rows[0]?.name ?? null)}). ` +
        "¿Está .env.local apuntando al proyecto Supabase equivocado?",
    );
  }
}

/** Reimpone la línea base. Idempotente: correrla sobre una semilla limpia no
 *  cambia ninguna fila. */
export async function restoreQaSeed(): Promise<void> {
  await assertQaUniverse();

  for (const item of ERA_UNO_BASELINE) {
    // `position` y `placement` van en el MISMO PATCH: el CHECK
    // `saga_items_placement_position` exige `position IS NOT NULL` cuando
    // `placement = 'fijo'`, así que separarlos rebota. No hay índice único
    // sobre (saga_id, position) —un tándem es justo un empate—, así que los
    // PATCH secuenciales no chocan entre sí aunque crucen posiciones.
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_type=eq.book&item_id=eq.${item.itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ position: item.position, placement: "fijo", optional: false, role: null }),
    });
  }

  await api(`sagas?id=eq.${NIETA_ID}`, { method: "PATCH", body: JSON.stringify(NIETA_BASELINE) });

  await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
}
