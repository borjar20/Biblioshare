# Navegación anónima + entrada a login/signup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un usuario sin sesión pueda navegar las pantallas públicas con chrome propio (nav + botones de login/signup) y, al iniciar sesión desde una página bloqueada, vuelva a ella vía `/login?next=`.

**Architecture:** Sin middleware (el gating es per-page `if (!user) redirect(...)`). Se amplía el chrome (`AppShell`/`Header`/`TopNav`/`BottomNav`) para pintar una variante anónima, y se enseña a `login()` a respetar un `next` saneado. Las páginas gated pasan a redirigir con `?next=<su ruta>`.

**Tech Stack:** Next.js App Router (server components), Supabase auth, next-intl (locale único `messages/es.json`), Vitest (unit), Playwright (e2e).

## Global Constraints

- Locale único: **`messages/es.json`** (no hay más ficheros de idioma).
- Anti-open-redirect: un `next` solo es válido si `raw.startsWith("/") && !raw.startsWith("//")`; en cualquier otro caso → `/`.
- Vitest corre con Node 22 (fnm). Antes de `vitest`: `fnm use` (el shell arranca en 20.9). Ver memoria `node-y-vitest`.
- Playwright reutiliza el `next dev` en el puerto 3000; no levantar un segundo server. Ver `AGENTS.md`.
- El set público de nav para anónimos = **Inicio · Buscar · Clubes**. Colección y Perfil NO aparecen para el anónimo.
- Signup NO cambia su destino (`/onboarding`).

---

### Task 1: Helper `safe-next.ts` (`safeNext` + `loginHref`)

**Files:**
- Create: `src/lib/auth/safe-next.ts`
- Test: `src/lib/auth/safe-next.test.ts`
- Modify: `src/app/auth/confirm/route.ts:15-17` (reusar `safeNext`)

**Interfaces:**
- Produces:
  - `safeNext(raw: string | null | undefined): string` — ruta interna o `"/"`.
  - `loginHref(path: string): string` — `"/login?next=" + encodeURIComponent(path)`.

- [ ] **Step 1: Write the failing test**

`src/lib/auth/safe-next.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { safeNext, loginHref } from "./safe-next";

describe("safeNext", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/coleccion")).toBe("/coleccion");
    expect(safeNext("/club/mi-club?tab=x")).toBe("/club/mi-club?tab=x");
  });
  it("rechaza protocol-relative y externas", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("evil")).toBe("/");
  });
  it("cae a / con vacío/null", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});

describe("loginHref", () => {
  it("codifica la ruta en next", () => {
    expect(loginHref("/coleccion")).toBe("/login?next=%2Fcoleccion");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `fnm use && npx vitest run src/lib/auth/safe-next.test.ts`
Expected: FAIL — `Cannot find module './safe-next'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/auth/safe-next.ts`:
```ts
// Guarda anti-open-redirect para los `?next=` de auth. Un destino solo vale si
// es una ruta interna: empieza por "/" pero no por "//" (que el navegador trata
// como protocol-relative hacia otro host). Extraída de /auth/confirm, que ya la
// tenía inline; ahora la comparten login y confirm.
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

// Enlace a login que recuerda a dónde volver. Lo usan las páginas gated al
// redirigir al anónimo.
export function loginHref(path: string): string {
  return "/login?next=" + encodeURIComponent(path);
}
```

- [ ] **Step 4: Reusar en `/auth/confirm/route.ts`**

Reemplazar las líneas 15-17:
```ts
  const rawNext = searchParams.get("next") ?? "/";
  // Solo rutas internas: evita usar este endpoint como open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
```
por:
```ts
  const next = safeNext(searchParams.get("next"));
```
y añadir el import arriba: `import { safeNext } from "@/lib/auth/safe-next";`

- [ ] **Step 5: Run tests to verify they pass**

Run: `fnm use && npx vitest run src/lib/auth/safe-next.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/safe-next.ts src/lib/auth/safe-next.test.ts src/app/auth/confirm/route.ts
git commit -m "feat(auth): helper safeNext + loginHref, reusado en /auth/confirm"
```

---

### Task 2: `login()` respeta `next`

**Files:**
- Modify: `src/app/(auth)/actions.ts` (función `login`)
- Modify: `src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `safeNext` de Task 1.
- Produces: tras login válido, redirige a `safeNext(formData.get("next"))`.

- [ ] **Step 1: Modificar el action `login`**

En `src/app/(auth)/actions.ts`, importar arriba:
```ts
import { safeNext } from "@/lib/auth/safe-next";
```
En `login`, sustituir el final `redirect("/");` por leer el `next`:
```ts
  if (error) {
    return { error: "invalidCredentials" };
  }

  redirect(safeNext(String(formData.get("next") ?? "")));
```

- [ ] **Step 2: Pasar `next` desde el formulario**

En `src/app/(auth)/login/login-form.tsx`:
- Añadir imports: `import { useSearchParams } from "next/navigation";`
- Dentro de `LoginForm`, tras `const t = ...`:
```ts
  const next = useSearchParams().get("next") ?? "";
```
- Dentro del `<form>`, como primer hijo:
```tsx
      <input type="hidden" name="next" value={next} />
```

- [ ] **Step 3: Verificar build de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en estos ficheros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/actions.ts" "src/app/(auth)/login/login-form.tsx"
git commit -m "feat(auth): login respeta ?next= y vuelve a la ruta de origen"
```

---

### Task 3: Set de navegación anónima + i18n

**Files:**
- Modify: `src/components/nav/nav-items.ts`
- Modify: `messages/es.json` (añadir `nav.items.login` y textos del header)

**Interfaces:**
- Consumes: `NavItem`, `navItems`, `primaryNavItems` existentes.
- Produces:
  - `NavItem["key"]` incluye `"login"`.
  - `anonNavItems(): NavItem[]` → `[home, search, clubs, login]` (login → `/login`, icono `UserIcon`). Para móvil (BottomNav).
  - `anonPrimaryNavItems(): NavItem[]` → `[home, search, clubs]` (sin login). Para escritorio (TopNav).

- [ ] **Step 1: Ampliar `nav-items.ts`**

En `src/components/nav/nav-items.ts`:
- En el type `NavItem`, ampliar `key`:
```ts
  key: "home" | "collection" | "search" | "clubs" | "profile" | "login";
```
- Al final del fichero, añadir:
```ts
// Navegación para el usuario SIN sesión: solo los destinos públicos (Inicio,
// Buscar, Clubes) más "Entrar". Colección y Perfil quedan fuera hasta que
// inicie sesión — su hueco lo ocupa el CTA de login del header.
export function anonNavItems(): NavItem[] {
  const all = navItems("");
  const publicItems = all.filter(
    (i) => i.key === "home" || i.key === "search" || i.key === "clubs"
  );
  return [
    ...publicItems,
    { key: "login", href: "/login", labelKey: "login", Icon: UserIcon },
  ];
}

// Igual que anonNavItems pero sin "Entrar": en escritorio el login vive como
// botón del header, no como entrada de la barra.
export function anonPrimaryNavItems(): NavItem[] {
  return anonNavItems().filter((i) => i.key !== "login");
}
```

- [ ] **Step 2: Añadir claves i18n**

En `messages/es.json`:
- Bajo `nav.items`, añadir: `"login": "Entrar"`.
- Bajo `nav` (o donde vivan los textos del header — junto a `nav.items`), añadir un bloque para los botones del header:
```json
"auth": { "signIn": "Iniciar sesión", "signUp": "Crear cuenta" }
```
(colócalo dentro de `nav`, quedando `nav.auth.signIn` / `nav.auth.signUp`).

- [ ] **Step 3: Verificar JSON válido**

Run: `node -e "require('./messages/es.json'); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav/nav-items.ts messages/es.json
git commit -m "feat(nav): set de navegación anónima + claves i18n"
```

---

### Task 4: Chrome anónimo (TopNav, BottomNav, Header, AppShell)

**Files:**
- Modify: `src/components/nav/top-nav.tsx`
- Modify: `src/components/nav/bottom-nav.tsx`
- Modify: `src/components/header.tsx`
- Modify: `src/components/nav/app-shell.tsx`

**Interfaces:**
- Consumes: `anonNavItems`, `anonPrimaryNavItems` de Task 3; `buttonVariants(variant, className)` de `@/components/ui/button`.
- Produces: `TopNav` y `BottomNav` aceptan `username: string | null`; `Header` pinta botones login/signup cuando `!loggedIn`.

- [ ] **Step 1: `TopNav` acepta anónimo**

En `src/components/nav/top-nav.tsx`:
- Cambiar la firma e import:
```ts
import { anonPrimaryNavItems, primaryNavItems, isNavItemActive } from "./nav-items";
```
```ts
export function TopNav({ username }: { username: string | null }) {
```
- Sustituir `primaryNavItems(username)` por:
```ts
      {(username ? primaryNavItems(username) : anonPrimaryNavItems()).map((item) => {
```

- [ ] **Step 2: `BottomNav` acepta anónimo**

En `src/components/nav/bottom-nav.tsx`:
- Import:
```ts
import { anonNavItems, navItems, isNavItemActive } from "./nav-items";
```
- Firma y items:
```ts
export function BottomNav({ username }: { username: string | null }) {
  const t = useTranslations("nav.items");
  const pathname = usePathname();
  const items = username ? navItems(username) : anonNavItems();
```

- [ ] **Step 3: `Header` con botones login/signup + TopNav anónimo**

En `src/components/header.tsx`:
- Añadir imports:
```ts
import { buttonVariants } from "@/components/ui/button";
```
- La firma ya recibe `loggedIn` y `username: string | null`. Cambiar el `TopNav` para que se pinte también para anónimos: sustituir `{username && <TopNav username={username} />}` por:
```tsx
        {(username || !loggedIn) && <TopNav username={username} />}
```
- En el bloque de acciones a la derecha, tras `<ThemeToggle />`, añadir el CTA cuando no hay sesión:
```tsx
        {!loggedIn && (
          <div className="ml-1 flex items-center gap-2">
            <Link href="/login" className={buttonVariants("ghost", "hidden px-3 py-1.5 text-[13px] sm:inline-flex")}>
              {t("auth.signIn")}
            </Link>
            <Link href="/signup" className={buttonVariants("primary", "px-3 py-1.5 text-[13px]")}>
              {t("auth.signUp")}
            </Link>
          </div>
        )}
```
- El `t` de `Header` hoy es `getTranslations("nav.items")`. Cambiarlo a `getTranslations("nav")` y ajustar los usos existentes de `t("profile")` → `t("items.profile")`. (Solo hay un uso: el `aria-label` del avatar en la línea del `UserAvatar`.)

- [ ] **Step 4: `AppShell` pinta chrome anónimo**

En `src/components/nav/app-shell.tsx`, sustituir el `return` final por uno que muestre `BottomNav` también para el anónimo:
```tsx
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Header
        loggedIn={Boolean(user)}
        username={showNav ? username : null}
        avatarUrl={avatarUrl}
        unreadCount={unreadCount}
      />
      <div className="flex flex-1 flex-col">{children}</div>
      {showNav ? (
        <BottomNav username={username as string} />
      ) : (
        !user && <BottomNav username={null} />
      )}
    </div>
  );
```
Nota: `!user` (anónimo) recibe la BottomNav anónima. El usuario logueado-pero-sin-onboarding (`user` sí, `showNav` no) sigue sin barra, como hoy.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/components/nav/top-nav.tsx src/components/nav/bottom-nav.tsx src/components/header.tsx src/components/nav/app-shell.tsx
git commit -m "feat(nav): chrome navegable para usuarios anónimos"
```

---

### Task 5: Páginas gated redirigen con `?next=`

**Files (17 páginas, todas `Modify`):**
`src/app/estadisticas/page.tsx`, `src/app/admin/page.tsx`, `src/app/cuenta/contrasena/page.tsx`, `src/app/club/[slug]/page.tsx`, `src/app/coleccion/page.tsx`, `src/app/club/[slug]/miembros/page.tsx`, `src/app/coleccion/c/[id]/page.tsx`, `src/app/club/[slug]/calendario/page.tsx`, `src/app/club/[slug]/actividad/[id]/page.tsx`, `src/app/notas/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/saga/[id]/rutas/[slug]/editar/page.tsx`, `src/app/saga/[id]/rutas/page.tsx`, `src/app/importar/pendientes/page.tsx`, `src/app/sagas/nueva/page.tsx`, `src/app/saga/[id]/editar/page.tsx`, `src/app/importar/page.tsx`

**Interfaces:**
- Consumes: `loginHref(path)` de Task 1.

- [ ] **Step 1: Editar cada página**

En cada fichero, añadir el import (junto a los demás de `@/lib/...`):
```ts
import { loginHref } from "@/lib/auth/safe-next";
```
y cambiar `redirect("/login")` por `redirect(loginHref("<ruta>"))`, con `<ruta>` = la ruta real de esa página, construida a partir de sus params. Tabla exacta:

| Fichero | Reemplazo |
|---|---|
| `estadisticas/page.tsx` | `redirect(loginHref("/estadisticas"))` |
| `admin/page.tsx` | `redirect(loginHref("/admin"))` |
| `cuenta/contrasena/page.tsx` | `redirect(loginHref("/cuenta/contrasena"))` |
| `coleccion/page.tsx` | `redirect(loginHref("/coleccion"))` |
| `notas/page.tsx` | `redirect(loginHref("/notas"))` |
| `importar/page.tsx` | `redirect(loginHref("/importar"))` |
| `importar/pendientes/page.tsx` | `redirect(loginHref("/importar/pendientes"))` |
| `onboarding/page.tsx` | `redirect(loginHref("/onboarding"))` |
| `sagas/nueva/page.tsx` | `redirect(loginHref("/sagas/nueva"))` |
| `coleccion/c/[id]/page.tsx` | `redirect(loginHref(\`/coleccion/c/${id}\`))` |
| `club/[slug]/page.tsx` | `redirect(loginHref(\`/club/${slug}\`))` |
| `club/[slug]/miembros/page.tsx` | `redirect(loginHref(\`/club/${slug}/miembros\`))` |
| `club/[slug]/calendario/page.tsx` | `redirect(loginHref(\`/club/${slug}/calendario\`))` |
| `club/[slug]/actividad/[id]/page.tsx` | `redirect(loginHref(\`/club/${slug}/actividad/${id}\`))` |
| `saga/[id]/editar/page.tsx` | `redirect(loginHref(\`/saga/${id}/editar\`))` |
| `saga/[id]/rutas/page.tsx` | `redirect(loginHref(\`/saga/${id}/rutas\`))` |
| `saga/[id]/rutas/[slug]/editar/page.tsx` | `redirect(loginHref(\`/saga/${id}/rutas/${slug}/editar\`))` |

Para los de params, verifica el nombre real de la variable ya desestructurada en cada página (`id`, `slug`) antes de interpolar; si el `await params` está más abajo que el `redirect`, mueve el `redirect` después de tener los params (todos estos ya resuelven params antes del guard salvo que compruebes lo contrario).

- [ ] **Step 2: Verificar que no queda ningún `redirect("/login")` pelado**

Run: `grep -rn 'redirect("/login")' src/app`
Expected: sin resultados.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app
git commit -m "feat(auth): páginas gated redirigen a /login?next= para volver tras entrar"
```

---

### Task 6: e2e + issue de follow-up + doc

**Files:**
- Create: `e2e/navegacion-anonima.spec.ts`

- [ ] **Step 1: Escribir el e2e**

`e2e/navegacion-anonima.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// El usuario SIN sesión: navega el chrome público y, al pisar una pantalla
// bloqueada, aterriza en /login?next= para volver tras entrar.
test("anónimo ve nav pública y botón de login en una página pública", async ({ page }) => {
  await page.goto("/buscar");
  // CTA de login en el header (no avatar).
  await expect(page.getByRole("link", { name: /iniciar sesión/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /crear cuenta/i })).toBeVisible();
  // Nav pública presente; Colección NO.
  await expect(page.getByRole("link", { name: /^Buscar$/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Colección$/ })).toHaveCount(0);
});

test("anónimo en página gated cae en /login?next= y no pierde el destino", async ({ page }) => {
  await page.goto("/coleccion");
  await expect(page).toHaveURL(/\/login\?next=%2Fcoleccion/);
});
```

- [ ] **Step 2: Correr el e2e (reusa el dev server en :3000)**

Run: `npm run test:e2e -- navegacion-anonima`
Expected: 2 passed. (Si no hay dev server, arráncalo UNA vez en :3000 antes; ver `AGENTS.md`.)

- [ ] **Step 3: Commit**

```bash
git add e2e/navegacion-anonima.spec.ts
git commit -m "test(anon): e2e de navegación anónima y redirección a login con next"
```

- [ ] **Step 4: Abrir la issue de follow-up**

Crear issue en el repo (regla de `AGENTS.md`: lo pendiente vive como issue). Título: «Acciones in-page piden login al anónimo». Cuerpo: en las páginas públicas (ficha de libro/serie/saga/persona, perfil, feed, comunidad) las acciones que exigen sesión —seguir, botones de estado del hero, `LogPanel` (registrar sesión), reacciones/comentarios— hoy asumen usuario logueado y fallan/redirigen desde el server action. Convertirlas en redirección a `/login?next=<ruta-actual>` al pulsar. Descubierto al implementar la navegación anónima (spec `2026-08-02-navegacion-anonima-login-design.md`, dejado fuera de esa PR a propósito). Reproducir: sin sesión, entrar a `/libro/<id>` y pulsar "Seguir"/estado.

- [ ] **Step 5: Cerrar doc (Definición de «hecho»)**

- No hay cambio de esquema → `data-model.md` no se toca.
- Añadir entrada al final de `docs/requirements/decisiones.md` (append-only): decisión de que el anónimo tiene chrome propio con nav pública (Inicio/Buscar/Clubes), login/signup en el header, y retorno vía `?next=` solo en login (signup va a onboarding).
- Revisar `docs/requirements/backlog.md`: si existe una casilla para «acceso anónimo / navegación sin login», marcarla.
- Commit: `git add docs && git commit -m "docs(anon): decisión de navegación anónima + login/signup"`

---

## Self-Review

- **Cobertura del spec:** §1 chrome → Tasks 3,4; §2 `?next=` → Tasks 1,2,5; follow-up issue → Task 6.4; verificación → Task 6.1. Sin huecos.
- **Placeholders:** ninguno; todo el código va inline y la tabla de las 17 páginas da el reemplazo exacto.
- **Consistencia de tipos:** `safeNext`/`loginHref` (Task 1) usados igual en Tasks 2 y 5; `anonNavItems`/`anonPrimaryNavItems` (Task 3) consumidos en Task 4; `TopNav`/`BottomNav` con `username: string | null` en todos sus call-sites (`AppShell`, `Header`).
