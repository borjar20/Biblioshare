// Barrido del rastro desechable que los e2e dejan en `dev` (issue #800).
//
// Cada spec crea su propio catálogo (libros/sagas/personas con prefijo `E2E`) y
// sus propios usuarios (`<loquesea><timestamp>@example.com`), y los borra en un
// `finally`. La base debería quedar como estaba. No queda, por DOS causas
// distintas — y la segunda es la que más filas deja:
//
//  1. **El `finally` no corre si el test muere por timeout.** Playwright aborta
//     y las filas se quedan. Es la causa que documenta la #800.
//  2. **El borrado del usuario FALLA en silencio.** `club_posts.author_id`,
//     `clubs.owner_id`, `club_activities.created_by`, `club_activity_items.
//     added_by` y `club_activity_checkpoints.created_by` referencian
//     `auth.users` con **ON DELETE NO ACTION**: mientras exista una de esas
//     filas, el DELETE del usuario rebota. Los helpers `deleteUser` de los
//     specs hacen `fetch(...)` sin mirar `res.ok`, así que el test pasa en
//     verde y el usuario se queda. Medido el 2026-08-25: los 15 usuarios
//     `reporta*` de `social-safety.spec.ts` —TODOS con un `club_post`— llevaban
//     ahí desde el 2026-07-30 pese a que ese spec termina bien.
//
// Por eso el barrido va ANTES de la suite y no confía en la limpieza de nadie:
// borra primero lo que bloquea y luego el usuario. Mismo patrón que
// `restoreQaSeed` (#215) — reimponer el punto de partida en vez de esperar que
// la pasada anterior se portara bien.
//
// NO es sustituto del `finally` de cada spec: entre tests de la MISMA pasada
// solo limpia el `finally`. Esto recoge lo que sobrevive de pasadas anteriores.

import { assertQaUniverse, serviceEnv } from "./qa-seed";

/** Prefijos con los que los specs bautizan su catálogo desechable. `*` es el
 *  comodín de PostgREST (no `%`). Un título sin prefijo no se puede barrer sin
 *  arriesgarse a llevarse datos de verdad: ver la nota al final del fichero. */
const CATALOG_PATTERNS = ["E2E *", "[E2E]*"] as const;

/** Los 19 helpers `createUser` de la suite firman igual: `<username>@example.com`.
 *  Ninguna cuenta real usa ese dominio (la de `devtest` es de Gmail), así que es
 *  la marca más segura que hay: no depende de acertar el prefijo de cada spec. */
const DISPOSABLE_EMAIL_DOMAIN = "@example.com";

/** Tablas que apuntan a `auth.users` con ON DELETE NO ACTION. En este orden:
 *  lo de dentro de una actividad antes que la actividad, y el club el último. */
const USER_BLOCKERS: Array<{ table: string; column: string }> = [
  { table: "club_posts", column: "author_id" },
  { table: "club_activity_items", column: "added_by" },
  { table: "club_activity_checkpoints", column: "created_by" },
  { table: "club_activities", column: "created_by" },
  { table: "clubs", column: "owner_id" },
];

/** Referencias POLIMÓRFICAS al catálogo (`item_id`/`anchor_id` sin FK, así que
 *  nada las arrastra en cascada). Si no se barren, borrar el libro deja un post
 *  huérfano en el feed de `devtest` — que es justo lo que ensucia las
 *  aserciones que usan `.first()`/`.last()` sobre el feed. En este orden: lo
 *  que cuelga del pase antes que el pase. */
const CATALOG_REFS: Array<{ table: string; column: string }> = [
  { table: "posts", column: "anchor_id" },
  { table: "collection_items", column: "item_id" },
  { table: "pass_reviews", column: "item_id" },
  { table: "passes", column: "item_id" },
];

/** Tablas de catálogo y la columna por la que se reconocen. */
const CATALOG_TABLES: Array<{ table: string; column: string }> = [
  { table: "books", column: "title" },
  { table: "sagas", column: "name" },
  { table: "people", column: "name" },
];

type Contador = Record<string, number>;

async function rest(path: string, init?: RequestInit) {
  const { url, key } = serviceEnv();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function auth(path: string, init?: RequestInit) {
  const { url, key } = serviceEnv();
  return fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
  });
}

/** Un DELETE que NO tumba la suite si falla. El barrido es higiene, no
 *  corrección: bloquear toda la suite porque una fila se resistió cambiaría un
 *  problema de limpieza por uno peor. Lo que sí hace es DECIRLO. */
async function borrar(path: string, etiqueta: string): Promise<number> {
  try {
    const res = await rest(path, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!res.ok) {
      console.warn(`[sweep] ${etiqueta}: ${res.status} — ${(await res.text()).slice(0, 200)}`);
      return 0;
    }
    const filas = (await res.json()) as unknown[];
    return Array.isArray(filas) ? filas.length : 0;
  } catch (e) {
    console.warn(`[sweep] ${etiqueta}: ${String(e)}`);
    return 0;
  }
}

function suma(contador: Contador, clave: string, n: number) {
  if (n > 0) contador[clave] = (contador[clave] ?? 0) + n;
}

/** PostgREST corta las URLs muy largas; 100 ids por tanda van sobrados. */
function tandas<T>(items: T[], tam = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += tam) out.push(items.slice(i, i + tam));
  return out;
}

/** Ids del catálogo desechable, por prefijo. */
async function idsDeCatalogo(): Promise<string[]> {
  const ids: string[] = [];
  for (const { table, column } of CATALOG_TABLES) {
    for (const patron of CATALOG_PATTERNS) {
      // El patrón va codificado y SIN comillas. Entrecomillarlo (el reflejo,
      // porque `[E2E]*` empieza por corchete) hace que PostgREST busque las
      // comillas dentro del texto: devuelve 200 y CERO filas, que es el fallo
      // que peor se detecta — parece «no había nada que barrer». Comprobado
      // contra dev: sin comillas salen 22/21/5/5, los mismos números que el
      // `SELECT` de la #800.
      const filtro = `${column}=like.${encodeURIComponent(patron)}`;
      const res = await rest(`${table}?${filtro}&select=id`);
      if (!res.ok) {
        console.warn(`[sweep] listar ${table} (${patron}): ${res.status} — ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      for (const fila of (await res.json()) as Array<{ id: string }>) ids.push(fila.id);
    }
  }
  return ids;
}

async function usuariosDesechables(): Promise<Array<{ id: string; email: string }>> {
  const propio = process.env.TEST_USER_EMAIL?.toLowerCase() ?? "";
  const out: Array<{ id: string; email: string }> = [];
  // El admin API pagina; se recorre hasta que una página vuelve vacía.
  for (let page = 1; page <= 20; page += 1) {
    const res = await auth(`admin/users?page=${page}&per_page=200`);
    if (!res.ok) {
      console.warn(`[sweep] listar usuarios: ${res.status} — ${(await res.text()).slice(0, 200)}`);
      break;
    }
    const { users } = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
    if (!users?.length) break;
    for (const u of users) {
      const email = (u.email ?? "").toLowerCase();
      // La cuenta con la que corre la suite NUNCA se toca, pase lo que pase.
      if (email && email !== propio && email.endsWith(DISPOSABLE_EMAIL_DOMAIN)) {
        out.push({ id: u.id, email });
      }
    }
    if (users.length < 200) break;
  }
  return out;
}

/**
 * Barre el rastro desechable de pasadas anteriores. Idempotente y tolerante a
 * fallos: nunca lanza, para que un problema de limpieza no impida correr los
 * tests. Devuelve lo que ha borrado, y lo imprime.
 */
export async function sweepDisposableData(): Promise<Contador> {
  // Misma guarda de seguridad que la semilla QA: esto escribe con la SERVICE
  // KEY y borra usuarios. Si `.env.local` apunta a otro proyecto, aborta antes
  // de tocar una sola fila.
  await assertQaUniverse();

  const contador: Contador = {};

  // ── Usuarios desechables: primero lo que bloquea, luego el usuario ──
  const usuarios = await usuariosDesechables();
  let usuariosBorrados = 0;
  const fallidos: string[] = [];
  for (const usuario of usuarios) {
    for (const { table, column } of USER_BLOCKERS) {
      suma(contador, table, await borrar(`${table}?${column}=eq.${usuario.id}`, `${table} de ${usuario.email}`));
    }
    const res = await auth(`admin/users/${usuario.id}`, { method: "DELETE" });
    // Aquí SÍ se mira `res.ok`: no mirarlo es justo lo que dejó 62 usuarios en
    // `dev` durante seis semanas sin que nadie se enterara.
    if (res.ok) usuariosBorrados += 1;
    else fallidos.push(`${usuario.email} (${res.status})`);
  }
  suma(contador, "usuarios", usuariosBorrados);
  if (fallidos.length > 0) {
    console.warn(`[sweep] ${fallidos.length} usuarios no se pudieron borrar: ${fallidos.slice(0, 5).join(", ")}`);
  }

  // ── Catálogo desechable y lo que le apunta sin FK ──
  const ids = await idsDeCatalogo();
  for (const tanda of tandas(ids)) {
    const lista = `(${tanda.join(",")})`;
    for (const { table, column } of CATALOG_REFS) {
      suma(contador, table, await borrar(`${table}?${column}=in.${lista}`, `${table}.${column}`));
    }
    for (const { table } of CATALOG_TABLES) {
      suma(contador, table, await borrar(`${table}?id=in.${lista}`, table));
    }
  }

  const resumen = Object.entries(contador)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  console.log(resumen ? `[sweep] barrido de pasadas anteriores — ${resumen}` : "[sweep] nada que barrer");
  return contador;
}

// Límite asumido, anotado a propósito: solo se barre el catálogo con prefijo
// `E2E`/`[E2E]`. Varios specs titulan sus obras sin prefijo («Estreno dos …»,
// «en curso …», «shell pc …») y esas no se pueden distinguir de un dato real
// por el título, así que se quedan. Queda como issue aparte; lo que corresponde
// es que los specs nuevos usen el prefijo, no que el barrido adivine.
