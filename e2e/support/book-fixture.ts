// El libro fixture de `devtest`, resuelto por IDENTIDAD y no por título.
//
// ── Por qué existe este fichero ──────────────────────────────────────────
//
// Seis specs resolvían este mismo libro con `books?title=eq.The Final Empire`.
// El 2026-08-28, al correr la suite entera contra build de producción desde la
// rama `feat/obra-edicion-representacion`, los seis se pusieron en rojo con
// «no se encontró el libro fixture "The Final Empire"». **No era un fallo del
// producto: era el producto haciendo exactamente lo que se le pidió.**
//
// El plan obra/edición/representación cambió la hidratación a fill-or-upgrade
// por rango de idioma (`es < en < other < unknown`, migración `20260883`): en
// cuanto una candidata española está disponible, PISA al título inglés. La fila
// de dev pasó a llamarse **«El imperio final»**, con
// `repr_meta.title = {lang:"es", source:"openlibrary"}`. Comprobado en dev el
// mismo día: `title=eq.The Final Empire` devuelve cero filas.
//
// Y va a volver a pasar. Cualquier obra traducida puede cambiar de título
// cuando alguien abra su ficha y OpenLibrary tenga una edición española que
// antes no tenía — no hace falta que nadie toque el código. **El título es un
// campo de representación, y la representación es justo lo que este plan hizo
// mudable a propósito.**
//
// ── Por qué la work key y no el UUID ────────────────────────────────────
//
// El UUID sobrevive a los renombres, pero no a un reset de dev, que es la razón
// por la que estos helpers no usaban ids fijos. `openlibrary_work_key` sirve
// para las dos cosas: identifica la OBRA (no una tirada ni una traducción),
// sobrevive a que cambie el idioma de la representación, y si dev se recrea
// desde OpenLibrary la fila vuelve a nacer con la misma clave. Además hay un
// índice único sobre ella (`20260870_books_openlibrary_work_key_unique.sql`),
// así que no puede devolver dos filas.

/** «El imperio final» / «The Final Empire» (Mistborn 1, Brandon Sanderson). */
export const FINAL_EMPIRE_WORK_KEY = "/works/OL5738148W";

/** Filtro PostgREST ya codificado, para pegar en la query string. */
export const FINAL_EMPIRE_FILTER = `openlibrary_work_key=eq.${encodeURIComponent(
  FINAL_EMPIRE_WORK_KEY,
)}`;

/**
 * Resuelve el libro fixture por work key. `select` se pasa tal cual, así que
 * cada spec pide las columnas que necesita (`id`, `id,total_pages`…).
 *
 * Lanza con un mensaje que dice QUÉ se buscó: si dev se queda sin la fila, el
 * rojo tiene que apuntar al entorno y no parecer un fallo del producto.
 */
export async function resolveFinalEmpire<T>(
  supabaseUrl: string,
  headers: Record<string, string>,
  select: string,
): Promise<T> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/books?${FINAL_EMPIRE_FILTER}&select=${select}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(
      `resolveFinalEmpire: GET books?${FINAL_EMPIRE_FILTER} devolvió ${res.status}`,
    );
  }
  const [row] = (await res.json()) as T[];
  if (!row) {
    throw new Error(
      `no se encontró el libro fixture con openlibrary_work_key=${FINAL_EMPIRE_WORK_KEY} ` +
        `(era «The Final Empire»; desde 20260883 su título puede estar en español). ` +
        `Si dev se ha reseteado, hay que volver a sembrarlo.`,
    );
  }
  return row;
}
