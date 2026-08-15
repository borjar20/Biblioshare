# Enlace del autor a su ficha de persona — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el autor de la fila «Autor» de la ficha de libro sea un enlace a `/persona/[id]`, único acceso hoy inexistente desde un libro a la ficha de persona.

**Architecture:** `MetaRow` (el tipo de fila de `MetadataSidebar`, el panel de metadatos que comparten libro, película y serie) gana un campo opcional `links`. Si viene, la fila pinta un `<Link>` de `next/link` por entrada en lugar del texto plano; si no, se comporta exactamente como hoy. La página de libro rellena ese campo con los créditos de rol `author` que ya carga (`getItemCredits`), que traen `people.id`. Cambio aditivo: película y serie no pasan `links` y no cambian.

**Tech Stack:** Next.js (App Router, React Server Components), TypeScript, Tailwind, next-intl, Playwright (e2e), Supabase (PostgREST para sembrar el caso de prueba).

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-13-libro-enlace-autor-design.md`.
- **Node:** el shell abre con Node v20 y eso rompe las herramientas del repo. Antes de cualquier `npm`/`npx`, fijar v22 en esa misma sesión de shell: `fnm use 22` (o `fnm exec --using=22 -- <comando>`). Comprobar con `node -v` → debe decir `v22.x`.
- **Directorio de trabajo:** todo se ejecuta desde el worktree `D:\Proyectos\Personal\Biblioshare\.claude\worktrees\persona-tres-columnas`. No hacer `cd` al repo principal.
- **Servidor dev:** un solo `next dev` y en el puerto **3000**. `npm run test:e2e` reutiliza el que ya haya; no levantar un segundo. Si 3000 está ocupado por una sesión vieja: `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess` y `Stop-Process -Id <pid>`.
- **Variables de entorno:** el worktree ya tiene `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. El spec e2e se salta solo (`test.skip`) si faltan.
- **Idioma de la UI y de los comentarios de código:** español, como el resto del repo. Los identificadores, en inglés.
- **Copy exacto de la etiqueta:** la fila usa `tMeta("author")` → `"Autor"` en `messages/es.json` (`detail.meta.author`). No se añade ninguna clave nueva de i18n.

---

## File Structure

| Fichero | Responsabilidad | Acción |
|---|---|---|
| `src/components/detail/metadata-sidebar.tsx` | Panel de metadatos de la pestaña Info (filas etiqueta/valor + géneros). Aquí vive el tipo `MetaRow` y el pintado de la fila. | Modificar |
| `src/app/libro/[id]/page.tsx` | Ficha de libro. Ya carga créditos y construye `metaRows`. | Modificar |
| `e2e/libro-autor-enlace.spec.ts` | Prueba end-to-end del acceso libro → persona. Se siembra su propio libro, su persona y su crédito. | Crear |
| `docs/requirements/decisiones.md` | Registro append-only de decisiones de forma. | Modificar (Tarea 2) |

---

### Task 1: La fila «Autor» enlaza a la ficha de persona

**Files:**
- Test: `e2e/libro-autor-enlace.spec.ts` (crear)
- Modify: `src/components/detail/metadata-sidebar.tsx:3` (tipo `MetaRow`) y `:17-30` (pintado de la fila)
- Modify: `src/app/libro/[id]/page.tsx:429-431` (construcción de `metaRows`) y la zona de imports

**Interfaces:**
- Consumes: `getItemCredits("book", id)` de `@/lib/people/get-item-credits`, que devuelve `ItemCredits = { cast: Credit[]; crew: Credit[] }`; cada `Credit` tiene `{ id, name, photoUrl, role, character }` donde `id` es `people.id`. La página ya lo llama (línea 331) y ya filtra `authorCredits` (línea 347). `personHref(id: string): string` de `@/lib/catalog/item-href` devuelve `` `/persona/${id}` ``.
- Produces: `export type MetaRow = { label: string; value: string; links?: { href: string; label: string }[] }` en `src/components/detail/metadata-sidebar.tsx`. Consumidores actuales (`src/app/pelicula/[id]/page.tsx:347`, `src/app/serie/[id]/page.tsx:391`) siguen compilando sin tocarlos porque `links` es opcional.

- [ ] **Step 1: Escribir el e2e que falla**

Crear `e2e/libro-autor-enlace.spec.ts` con este contenido íntegro. Siembra su propio caso con la clave de servicio (persona sin `tmdb_id` + libro + crédito `author`), así no llama a ninguna API externa y no depende de qué haya en la base de dev:

```ts
import { test, expect, type Page } from "@playwright/test";

// Desde la ficha de un libro se tiene que poder llegar a la ficha de su autor.
// Spec: docs/superpowers/specs/2026-08-13-libro-enlace-autor-design.md
//
// Se siembra el caso entero (persona SIN tmdb_id = autora de libro, libro y
// crédito `author`) para no llamar a Open Library ni depender de la base de dev.
// Sembrar el crédito además hace que `ensureItemEnriched` no tenga nada que
// hacer al abrir la ficha: el caso es determinista.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2la";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

test.use({ serviceWorkers: "block" });

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

async function del(path: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: adminHeaders() });
}

async function sweepDisposableUsers() {
  const rows = (await (
    await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
}

async function createOnboardedUser(username: string): Promise<{ id: string; email: string }> {
  const email = `${username}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin/users: ${res.status} — ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      username,
      display_name: username,
      is_public: false,
      onboarded_at: new Date().toISOString(),
    }),
  });
  return { id: user.id, email };
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("ficha de libro · acceso al autor", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(180_000);

  test("el autor de la ficha lleva a su ficha de persona", async ({ page }) => {
    await sweepDisposableUsers();

    const user = await createOnboardedUser(`${USER_PREFIX}${Date.now()}`.slice(0, 20));
    const personId = crypto.randomUUID();
    const bookId = crypto.randomUUID();
    const authorName = `[E2E] Autora ${personId.slice(0, 8)}`;

    try {
      await rest("people", {
        method: "POST",
        body: JSON.stringify({ id: personId, name: authorName }),
      });
      await rest("books", {
        method: "POST",
        body: JSON.stringify({
          id: bookId,
          title: `[E2E] libro ${bookId.slice(0, 8)}`,
          author: authorName,
          cover_url: COVER_URL,
          published_year: 2019,
          total_pages: 300,
        }),
      });
      await rest("credits", {
        method: "POST",
        body: JSON.stringify({
          item_type: "book",
          item_id: bookId,
          person_id: personId,
          role: "author",
        }),
      });

      await loginAs(page, user.email);
      await page.setViewportSize({ width: 1700, height: 1000 });
      await page.goto(`/libro/${bookId}`);

      // La ficha de la obra se pinta dos veces (móvil y PC) desde el mismo
      // array de filas; a 1700px la visible es la de la columna lateral.
      const enlaceAutor = page.getByRole("link", { name: authorName }).first();
      await expect(enlaceAutor).toBeVisible();
      await expect(enlaceAutor).toHaveAttribute("href", `/persona/${personId}`);

      // Y de verdad lleva a la ficha de persona, no solo apunta a ella.
      await enlaceAutor.click();
      await page.waitForURL(`**/persona/${personId}`);
      await expect(page.getByRole("heading", { name: authorName })).toBeVisible();
    } finally {
      await del(`credits?item_id=eq.${bookId}`);
      await del(`books?id=eq.${bookId}`);
      await del(`people?id=eq.${personId}`);
      await sweepDisposableUsers();
    }
  });
});
```

- [ ] **Step 2: Arrancar el dev server (si no hay uno) y correr el test para verlo fallar**

Comprobar Node y el puerto primero:

```powershell
node -v            # debe decir v22.x; si no: fnm use 22
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```

Correr solo este spec (Playwright levanta el dev server si no hay ninguno; si ya hay uno en 3000, lo reutiliza):

```powershell
npx playwright test e2e/libro-autor-enlace.spec.ts --reporter=list
```

Esperado: **FALLA** en `expect(enlaceAutor).toBeVisible()` con un error de tipo `locator.* : expected visible, waiting for getByRole('link', { name: '[E2E] Autora …' })` — hoy el nombre del autor se pinta como `<span>`, no como enlace.

- [ ] **Step 3: `MetaRow` admite enlaces**

En `src/components/detail/metadata-sidebar.tsx`, añadir el import de `Link` arriba del todo y ampliar el tipo:

```tsx
import Link from "next/link";
import { GenreTag } from "@/components/ui/genre-tag";

export type MetaRow = {
  label: string;
  value: string;
  /**
   * Si viene, el valor se pinta como enlaces (uno por entrada, separados por
   * coma) en vez de texto plano. Lo usa la fila «Autor» de la ficha de libro
   * para llegar a `/persona/[id]`; el resto de filas siguen con `value`.
   */
  links?: { href: string; label: string }[];
};
```

Y sustituir el `<span>` del valor (hoy `<span className="text-sm text-foreground">{row.value}</span>`) por:

```tsx
          {row.links && row.links.length > 0 ? (
            <span className="text-sm text-foreground">
              {row.links.map((link, j) => (
                <span key={link.href}>
                  {j > 0 && ", "}
                  <Link
                    href={link.href}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {link.label}
                  </Link>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-sm text-foreground">{row.value}</span>
          )}
```

- [ ] **Step 4: La ficha de libro pasa los enlaces**

En `src/app/libro/[id]/page.tsx`, añadir el import junto a los demás de `@/lib/catalog` (por ejemplo, justo encima del import de `getItemCredits`, línea 52):

```ts
import { personHref } from "@/lib/catalog/item-href";
```

Y sustituir la fila del autor (líneas 430-431, hoy `if (authorNames.length > 0) metaRows.push({ label: tMeta("author"), value: authorNames.join(", ") });`) por:

```ts
  // El autor enlaza a su ficha de persona: es el ÚNICO acceso desde un libro a
  // `/persona/[id]` (película y serie llegan por CreditsSection). Si el libro no
  // se pudo enriquecer, `authorCredits` está vacío y la fila se queda en texto
  // plano — nunca se pinta un enlace sin `people.id` detrás.
  if (authorNames.length > 0)
    metaRows.push({
      label: tMeta("author"),
      value: authorNames.join(", "),
      links:
        authorCredits.length > 0
          ? authorCredits.map((a) => ({ href: personHref(a.id), label: a.name }))
          : undefined,
    });
```

- [ ] **Step 5: Correr el e2e y verlo pasar**

```powershell
npx playwright test e2e/libro-autor-enlace.spec.ts --reporter=list
```

Esperado: `1 passed`.

- [ ] **Step 6: Typecheck y lint**

```powershell
npx tsc --noEmit
npm run lint
```

Esperado: `tsc` sin salida (0 errores) y `eslint` sin errores. Si `tsc` se queja en `pelicula`/`serie`, es que `links` quedó obligatorio: tiene que ser `links?`.

- [ ] **Step 7: Commit**

```powershell
git add src/components/detail/metadata-sidebar.tsx src/app/libro/[id]/page.tsx e2e/libro-autor-enlace.spec.ts
git commit -m "feat(libro): el autor de la ficha enlaza a su ficha de persona"
```

---

### Task 2: Sincronizar la documentación

**Files:**
- Modify: `docs/requirements/decisiones.md` (añadir al FINAL; es append-only)

**Interfaces:**
- Consumes: nada de la Tarea 1 en código; solo describe lo decidido allí.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: Leer el final del fichero para copiar el formato**

```powershell
Get-Content docs/requirements/decisiones.md -Tail 40
```

Fijarse en cómo titula cada entrada (fecha y encabezado) y replicarlo exactamente.

- [ ] **Step 2: Añadir la entrada al final**

Con el mismo estilo de encabezado que las entradas anteriores, añadir al final del fichero:

```markdown
## 2026-08-13 — El acceso a la ficha de persona desde un libro va en la fila «Autor», no en el hero

Desde una ficha de libro no había forma de llegar a `/persona/[id]`: el autor se pintaba
como texto plano dos veces (byline del hero y fila «Autor» de la ficha), pese a que la
página ya cargaba los créditos con `people.id`. Película y serie sí llegaban, vía
`CreditsSection`.

Se enlaza **la fila «Autor»** de `MetadataSidebar` (nuevo campo opcional `links` en
`MetaRow`), y se descartan las otras dos opciones:

- **El byline del hero, no.** Enlazarlo obliga a tocar `ItemShell`, compartido por los tres
  medios, y a subir los créditos por encima del `<Suspense>` del hero — justo lo que se
  evita a propósito para no bloquearlo.
- **`CreditsSection` en el libro, tampoco.** Para un libro el equipo es el autor y nada
  más, así que la sección duplicaría la fila «Autor» sin aportar dato nuevo.

Si el libro no está enriquecido, `authorCredits` viene vacío y la fila se queda en texto
plano: nunca se pinta un enlace sin `people.id` detrás.

Spec: `docs/superpowers/specs/2026-08-13-libro-enlace-autor-design.md`.
```

- [ ] **Step 3: Comprobar el resto de la lista de «hecho»**

Repasar y confirmar por escrito en el commit/PR que:
- **Esquema:** no se ha tocado (ni tablas, ni columnas, ni RLS, ni funciones) → `data-model.md` no cambia.
- **Backlog:** esto no cierra ninguna feature de `docs/requirements/backlog.md` → no se marca ninguna casilla.
- **Pendientes:** las filas `director` de película y `creator` de serie siguen siendo texto plano porque salen de columnas desnormalizadas (`movies.director`, `series.creator`) sin `people.id`. Abrir issue (Step 4).

- [ ] **Step 4: Abrir la issue del pendiente detectado**

```powershell
gh issue create --label "area:catalogo,tipo:deuda,P2" --title "Las filas «Dirección» y «Creación» de la ficha no enlazan a la persona" --body @'
Al enlazar el autor de un libro a su ficha de persona (spec
`docs/superpowers/specs/2026-08-13-libro-enlace-autor-design.md`), quedó fuera el caso de
película y serie.

**Qué pasa.** En la ficha de metadatos (`MetadataSidebar`), la fila «Dirección»
(`src/app/pelicula/[id]/page.tsx`) y la fila «Creación» (`src/app/serie/[id]/page.tsx`)
se pintan como texto plano.

**Por qué no se arregló ya.** Esas filas no salen de `credits`, sino de columnas
desnormalizadas de la propia obra (`movies.director`, `series.creator`), que son un nombre
suelto sin `people.id`. Enlazarlas obliga a resolver la persona desde los créditos, que es
otro trabajo.

**Qué SÍ funciona.** Película y serie ya llegan a la ficha de persona por `CreditsSection`
(`src/components/credits-section.tsx`), que enlaza equipo y reparto. O sea: el acceso
existe, lo que falta es que esas dos filas concretas también enlacen.

**Cómo verlo.** Abrir cualquier `/pelicula/<id>` con director conocido: en la ficha de la
derecha, «Dirección · Nombre» no es clicable; más abajo, en «Reparto y equipo», el mismo
nombre sí lo es.
'@
```

Anotar el número de issue que devuelve el comando.

- [ ] **Step 5: Commit**

```powershell
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): por qué el enlace al autor va en la ficha y no en el hero"
```

---

## Verificación final

- [ ] `npx playwright test e2e/libro-autor-enlace.spec.ts --reporter=list` → `1 passed`
- [ ] `npx tsc --noEmit` → sin errores
- [ ] `npm run lint` → sin errores
- [ ] `npm test` (Vitest, `vitest run`) → sin regresiones. Recordatorio: con Node v20 revienta; `fnm use 22` antes.
- [ ] Sin servidores colgados al terminar: `Get-Process node` no debe dejar más que, como mucho, el `next dev` del puerto 3000.
