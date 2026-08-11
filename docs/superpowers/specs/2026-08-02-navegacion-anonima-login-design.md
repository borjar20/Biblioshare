# Navegación anónima + entrada a login/signup

`[Canónico · verificado 2026-08-02]`

## Problema

Un usuario sin sesión puede *ver* las pantallas públicas (fichas de
`/libro`, `/serie`, `/pelicula`, `/persona`, `/saga`, `/genero`, `/buscar`,
`/sagas`, `/clubes`, perfiles `/u/[username]`), porque esas páginas no
redirigen. Pero **no puede navegar ni iniciar sesión desde el chrome**:
`AppShell` esconde `TopNav` y `BottomNav` cuando no hay `username`, y el
`Header` para un deslogueado solo pinta wordmark + toggle de tema. Aterriza en
una página pública y queda sin salida.

## Alcance

**Entra en esta PR:**

1. Chrome navegable para anónimos (nav pública + botones de login/signup).
2. Volver al sitio tras iniciar sesión, vía `/login?next=<ruta>`.

**No entra (→ issue aparte):** convertir las acciones in-page de las páginas
públicas (seguir, cambiar estado, registrar sesión, reacciones/comentarios) en
un prompt de login para el anónimo. Hoy esas acciones fallan/redirigen desde el
server action; rediseñarlas es superficie grande y va en su propia entrega.

## Diseño

### 1. Chrome para anónimos

La navegación (`nav-items.ts`) es fuente única para `TopNav` (escritorio) y
`BottomNav` (móvil). Las cinco entradas hoy: Inicio `/`, Colección `/coleccion`
(gated), Buscar `/buscar`, Clubes `/clubes`, Perfil `/u/[username]`.

Para el anónimo:

- **Set público** = Inicio · Buscar · Clubes (las tres sin sesión). Colección y
  Perfil **no** aparecen en la barra anónima: su hueco lo ocupa el CTA de login
  en el header. Se descubren al entrar. (Decisión de forma: barra más limpia
  frente a cebo-a-login; se eligió limpia.)
- **Header** (`!loggedIn`): sustituye avatar/campana por dos enlaces →
  `Iniciar sesión` (`/login`) y `Crear cuenta` (`/signup`). En escritorio,
  además, `TopNav` con el set público.
- **BottomNav** (móvil anónimo): Inicio · Buscar · Clubes · **Entrar**
  (`/login`).

Cambios de firma: `TopNav` y `BottomNav` aceptan `username: string | null`; con
`null` pintan el set público (y `BottomNav` añade el item `login`). `AppShell`
deja de esconder la nav para el anónimo: pinta el chrome público y el
`BottomNav` anónimo. La barra completa (con Colección/Perfil/avatar) sigue
condicionada a `username && onboarded`, igual que hoy.

`nav-items.ts` gana la key `"login"` y un helper para el set anónimo (Inicio,
Buscar, Clubes, +login en móvil).

### 2. Volver tras el login (`?next=`)

El patrón `?next=` ya existe en `/auth/confirm` (reset de contraseña), con la
guarda anti-open-redirect inline: `raw.startsWith("/") && !raw.startsWith("//")`.

- **`src/lib/auth/safe-next.ts`**: extrae esa guarda a `safeNext(raw): string`
  (devuelve la ruta interna o `/`). Se reusa en `/auth/confirm/route.ts`.
- **`login()` action**: lee `formData.get("next")`, lo pasa por `safeNext` y
  redirige ahí (por defecto `/`). Antes: `redirect("/")` fijo.
- **`LoginForm`**: `<input type="hidden" name="next">` con el valor de
  `useSearchParams().get("next")`.
- **Páginas gated** (17 sitios con `redirect("/login")`): pasan a
  `redirect(loginHref("/ruta"))`, siendo `loginHref(path)` un helper trivial
  que devuelve `/login?next=<encodeURIComponent(path)>`. Cada página conoce su
  propia ruta/params. Vive junto a `safe-next.ts`.
- **Signup NO cambia**: un usuario recién creado va a `/onboarding` (asistente
  único), no rebota a la página bloqueada. Es el comportamiento correcto.

## Ficheros

- `src/components/nav/nav-items.ts` — set público + key `login`.
- `src/components/nav/app-shell.tsx` — pinta chrome anónimo.
- `src/components/header.tsx` — botones login/signup + TopNav anónimo.
- `src/components/nav/top-nav.tsx`, `bottom-nav.tsx` — `username: string | null`.
- `src/lib/auth/safe-next.ts` — `safeNext()` + `loginHref()` (nuevo).
- `src/app/(auth)/actions.ts` — `login()` respeta `next`.
- `src/app/(auth)/login/login-form.tsx` — hidden `next`.
- `src/app/auth/confirm/route.ts` — reusa `safeNext`.
- 17 páginas gated — `redirect(loginHref(...))`.
- `messages/*.json` — `nav.items.login`, textos de los botones del header.

Sin cambios de esquema.

## Verificación

e2e Playwright:

1. Anónimo visita `/libro/[id]` → ve TopNav/BottomNav públicos + botón
   `Iniciar sesión` en el header (no ve avatar ni Colección).
2. Anónimo abre un deep-link gated (`/coleccion`) → aterriza en
   `/login?next=/coleccion`.
3. Tras login válido → vuelve a `/coleccion`, no a `/`.
4. `safeNext` rechaza `//evil.com` y rutas no internas → `/`.

## Follow-up (issue a abrir)

Acciones in-page para anónimos: seguir, botones de estado del hero, registrar
sesión (`LogPanel`), reacciones/comentarios del feed y comunidad. Hoy asumen
sesión. Convertirlas en redirección a `/login?next=<ruta-actual>` al pulsar.
