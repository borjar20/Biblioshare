# «Seguir» en el hero + tab «Mi registro» condicional — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover el botón «Seguir» al hero de la ficha y mostrar la pestaña «Mi registro» solo cuando el ítem tiene un pase (está seguido).

**Architecture:** El estado «seguido o no» ya vive de forma reactiva en `ItemStatusContext` (`status === null` = no seguido). Se aprovecha esa fuente única para: (1) pintar «Seguir» vs. la píldora de estado en el `statusSlot` del hero, y (2) incluir/excluir la pestaña `log` en `ItemDetailTabs`. Al seguir, el botón del hero hace un `setStatus("planned")` optimista, navega a `?tab=log` (canal hero→tabs que `ItemDetailTabs` ya vigila) y dispara `addExistingItemToLibrary`. La edición se difiere: el hero no tiene las ediciones (llegan por streaming), así que la pregunta «¿qué edición?» se queda donde ya vive, al empezar a leer.

**Tech Stack:** Next.js App Router (versión con breaking changes — ver Global Constraints), React 19 (client components, `useTransition`, ajuste-de-estado-durante-render en vez de `useEffect`), next-intl (solo `messages/es.json`), Tailwind, Vitest (unit), Playwright (e2e).

## Global Constraints

- **Leer la guía antes de escribir código Next.js:** este repo usa una versión de Next con breaking changes; consultar `node_modules/next/dist/docs/` (App Router, client components) ante cualquier duda de API. (AGENTS.md)
- **App en español, un solo fichero de mensajes:** `messages/es.json`. No existe `en.json`. Reutilizar claves existentes; solo añadir claves nuevas si el texto no existe.
- **Estado reactivo del pase activo:** fuente única `ItemStatusContext` (`src/components/detail/item-status-context.tsx`). `status === null` = sin pase activo = no en biblioteca. Nadie recalcula ese estado por su cuenta.
- **Patrón de sincronización cliente:** derivar de props con «ajuste de estado durante el render» (comparar contra un `prev`), NO `useEffect` — dispara `react-hooks/set-state-in-effect`. Ver `ItemStatusProvider`, `ManagedLog`.
- **Verificación:** `npx tsc --noEmit` y `npx eslint <ficheros>` deben quedar limpios en cada tarea que toque TS/TSX.
- **Ámbito:** libro, película y serie comparten hero y pestañas — todo cambio de página se replica en los tres `page.tsx`.

---

### Task 1: Helpers puros de visibilidad de pestañas

Lógica pura y testable: qué pestañas hay (según si es serie y si está seguido) y a cuál caer si la `?tab=` pedida no está disponible. Se extrae a un módulo sin `"use client"` ni imports de `next/*` para poder testearlo con Vitest.

**Files:**
- Create: `src/components/detail/tab-visibility.ts`
- Test: `src/components/detail/tab-visibility.test.ts`

**Interfaces:**
- Produces:
  - `type DetailTabId = "info" | "episodes" | "community" | "log"`
  - `detailTabOrder(hasEpisodes: boolean, followed: boolean): DetailTabId[]`
  - `clampDetailTab(requested: string | null, order: DetailTabId[]): DetailTabId`

- [ ] **Step 1: Escribir el test que falla**

Create `src/components/detail/tab-visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  detailTabOrder,
  clampDetailTab,
  type DetailTabId,
} from "./tab-visibility";

describe("detailTabOrder", () => {
  it("sin seguir y sin episodios: info + community, sin log", () => {
    expect(detailTabOrder(false, false)).toEqual(["info", "community"]);
  });

  it("seguido sin episodios: añade log al final", () => {
    expect(detailTabOrder(false, true)).toEqual(["info", "community", "log"]);
  });

  it("serie sin seguir: incluye episodes, sin log", () => {
    expect(detailTabOrder(true, false)).toEqual([
      "info",
      "episodes",
      "community",
    ]);
  });

  it("serie seguida: episodes + log", () => {
    expect(detailTabOrder(true, true)).toEqual([
      "info",
      "episodes",
      "community",
      "log",
    ]);
  });
});

describe("clampDetailTab", () => {
  const followed: DetailTabId[] = ["info", "community", "log"];
  const notFollowed: DetailTabId[] = ["info", "community"];

  it("devuelve la pestaña pedida si está disponible", () => {
    expect(clampDetailTab("community", followed)).toBe("community");
    expect(clampDetailTab("log", followed)).toBe("log");
  });

  it("cae a info si la pedida no está disponible (log sin seguir)", () => {
    expect(clampDetailTab("log", notFollowed)).toBe("info");
  });

  it("cae a info con null o un valor desconocido", () => {
    expect(clampDetailTab(null, followed)).toBe("info");
    expect(clampDetailTab("basura", followed)).toBe("info");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verel fallo**

Run: `npx vitest run src/components/detail/tab-visibility.test.ts`
Expected: FAIL — "Cannot find module './tab-visibility'".

(Si `vitest` se queja de la versión de Node, activar antes con `fnm use` / el `.nvmrc` — ver memoria «Node y vitest»: shell arranca en 20.9, hace falta Node 22.)

- [ ] **Step 3: Implementar el módulo**

Create `src/components/detail/tab-visibility.ts`:

```ts
// Lógica pura de qué pestañas enseña la ficha, extraída de ItemDetailTabs para
// poder testearla sin montar el componente. La pestaña "log" (Mi registro) solo
// existe cuando el ítem está seguido (tiene pase activo); "episodes" solo en
// series. El orden es el del mockup.
export type DetailTabId = "info" | "episodes" | "community" | "log";

export function detailTabOrder(
  hasEpisodes: boolean,
  followed: boolean,
): DetailTabId[] {
  const base: DetailTabId[] = hasEpisodes
    ? ["info", "episodes", "community"]
    : ["info", "community"];
  return followed ? [...base, "log"] : base;
}

// La pestaña pedida por ?tab= (deep link, o el ?tab=log que pone el botón
// "Seguir" del hero) se acota a las disponibles: pedir "log" sin seguir cae a
// "info", igual que un valor desconocido o ausente.
export function clampDetailTab(
  requested: string | null,
  order: DetailTabId[],
): DetailTabId {
  return requested && (order as string[]).includes(requested)
    ? (requested as DetailTabId)
    : "info";
}
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `npx vitest run src/components/detail/tab-visibility.test.ts`
Expected: PASS (10 asserts).

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/tab-visibility.ts src/components/detail/tab-visibility.test.ts
git commit -m "feat(ficha): helpers puros de visibilidad de pestañas (log condicional)"
```

---

### Task 2: `ItemDetailTabs` oculta «Mi registro» hasta seguir

Cablear los helpers de la Task 1 y `useItemStatus()` en el conmutador de pestañas: excluir `log` cuando no hay pase, y re-sincronizar la pestaña activa cuando cambia `?tab=` **o** el estado de seguido (para que el `?tab=log` que pone el hero conmute sin carrera).

**Files:**
- Modify: `src/components/detail/item-detail-tabs.tsx` (todo el cuerpo del componente)

**Interfaces:**
- Consumes: `detailTabOrder`, `clampDetailTab`, `DetailTabId` (Task 1); `useItemStatus` de `./item-status-context`.

- [ ] **Step 1: Reescribir cabecera de imports y tipos**

En `src/components/detail/item-detail-tabs.tsx`, sustituir las líneas 1-9 (imports + `type TabId` + `VALID_TABS`) por:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { useItemStatus } from "./item-status-context";
import {
  detailTabOrder,
  clampDetailTab,
  type DetailTabId,
} from "./tab-visibility";
```

- [ ] **Step 2: Reescribir el cuerpo (estado, order, sync, selectTab)**

Sustituir el bloque desde `const router = useRouter();` (línea ~31) hasta el cierre de `function selectTab(...)` (línea ~66) por:

```tsx
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");

  // Fuente única del "seguido o no": el mismo contexto que pinta el badge del
  // hero. followed=false esconde la pestaña "log" (Mi registro).
  const { status } = useItemStatus();
  const followed = status !== null;
  const order = detailTabOrder(Boolean(episodes), followed);

  const [tab, setTab] = useState<DetailTabId>(() =>
    clampDetailTab(urlTab, order),
  );

  // Re-sincroniza la pestaña activa cuando cambia la ?tab= de FUERA (deep link,
  // o el ?tab=log que pone el botón "Seguir" del hero) O cuando cambia el estado
  // de seguido. La clave combinada evita la carrera: al seguir, `setStatus` y
  // `router.replace(?tab=log)` pueden aterrizar en renders distintos; cualquiera
  // que llegue el segundo re-dispara este ajuste y conmuta a "log" ya con el
  // order que incluye la pestaña. Ajuste durante el render, no useEffect.
  const syncKey = `${urlTab ?? ""}|${followed}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    const next = clampDetailTab(urlTab, order);
    if (next !== tab) setTab(next);
  }

  const accent = MEDIA_ACCENT[itemType];
  const slots: Record<DetailTabId, ReactNode> = {
    info,
    episodes,
    community,
    log,
  };

  function selectTab(id: DetailTabId) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "info") params.delete("tab");
    else params.set("tab", id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }
```

Notas:
- Se elimina la variable local `order` antigua (la ternaria con `episodes`) y el `type TabId` local: ahora vienen del helper.
- El `.map(order)` del JSX ya itera `order`, que ahora excluye `log` cuando no se sigue — sin más cambios en el JSX (el `labels[id]` para `log` sigue existiendo; simplemente no se pinta su botón).

- [ ] **Step 3: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint src/components/detail/item-detail-tabs.tsx`
Expected: sin errores. (`labels` sigue siendo `Partial<Record<DetailTabId,string>>`; si TS se queja del tipo de `labels`, cambiar su anotación en las props de `TabId` → `DetailTabId`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/item-detail-tabs.tsx
git commit -m "feat(ficha): la pestaña «Mi registro» solo aparece con el ítem seguido"
```

---

### Task 3: Componente `HeroStatusOrFollow`

El `statusSlot` del hero: botón «Seguir» cuando no hay pase, píldora de estado (`StatusBadgeLive`) cuando sí. Al seguir (logueado): optimista `planned` → navega a `?tab=log` → persiste. Anónimo: dispara la acción, que redirige a `/login` server-side (sin badge optimista falso).

**Files:**
- Create: `src/components/detail/hero-status-or-follow.tsx`

**Interfaces:**
- Consumes: `useItemStatus` (`./item-status-context`), `StatusBadgeLive` (`./item-status-context`), `addExistingItemToLibrary` (`@/lib/library/add-existing-item`), `Button` (`@/components/ui/button`).
- Produces: `HeroStatusOrFollow` (default-free named export) con props:
  ```ts
  {
    itemType: ItemType;
    itemId: string;
    isLoggedIn: boolean;
    statusLabels: Record<MediaStatus, string>;
  }
  ```

- [ ] **Step 1: Crear el componente**

Create `src/components/detail/hero-status-or-follow.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button } from "@/components/ui/button";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import { useItemStatus, StatusBadgeLive } from "./item-status-context";

// El hueco del hero (statusSlot): sin pase → botón "Seguir"; con pase → la
// píldora de estado viva de siempre. Antes "Seguir" vivía escondido dentro de
// la pestaña Mi registro; aquí es visible desde cualquier pestaña.
//
// El hero se renderiza FUERA del <Suspense> de las pestañas, así que NO tiene
// las ediciones (llegan por streaming). Por eso "Seguir" añade directo como
// "planned" y la pregunta "¿qué edición?" se difiere a cuando se empieza a leer
// (panel Progreso), donde las ediciones ya están cargadas.
export function HeroStatusOrFollow({
  itemType,
  itemId,
  isLoggedIn,
  statusLabels,
}: {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  statusLabels: Record<MediaStatus, string>;
}) {
  const t = useTranslations("item");
  const { status, setStatus } = useItemStatus();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (status !== null) {
    return <StatusBadgeLive labels={statusLabels} />;
  }

  function follow() {
    // Anónimo: la server action redirige a /login. Sin optimismo ni navegación
    // a la pestaña — no está siguiendo de verdad.
    if (!isLoggedIn) {
      startTransition(() => addExistingItemToLibrary(itemType, itemId));
      return;
    }
    // Logueado: "planned" optimista (el badge del hero y la pestaña "Mi
    // registro" reaccionan al instante), salto a la pestaña vía ?tab=log (canal
    // que ItemDetailTabs vigila) y persistencia.
    setStatus("planned");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "log");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    startTransition(() => addExistingItemToLibrary(itemType, itemId));
  }

  return (
    <Button type="button" disabled={isPending} onClick={follow}>
      {isPending ? t("following") : t("follow")}
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint src/components/detail/hero-status-or-follow.tsx`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/hero-status-or-follow.tsx
git commit -m "feat(ficha): componente HeroStatusOrFollow (Seguir/estado en el hero)"
```

---

### Task 4: Cablear `HeroStatusOrFollow` en las tres páginas

Sustituir el `statusSlot={<StatusBadgeLive .../>}` por `<HeroStatusOrFollow .../>` en libro, película y serie.

**Files:**
- Modify: `src/app/libro/[id]/page.tsx:208` (y el import de `StatusBadgeLive` en :33)
- Modify: `src/app/pelicula/[id]/page.tsx:171` (import en :31)
- Modify: `src/app/serie/[id]/page.tsx:207` (import en :30)

**Interfaces:**
- Consumes: `HeroStatusOrFollow` (Task 3). `user` (ya disponible en cada page para `isLoggedIn`), `statusLabels` (ya calculado), `book`/`movie`/`series` id, `itemType`.

- [ ] **Step 1: Libro — cambiar import y statusSlot**

En `src/app/libro/[id]/page.tsx`:

En el import de `item-status-context` (línea 31-34), añadir `HeroStatusOrFollow` — pero vive en otro fichero. Añadir un import nuevo tras esa línea:

```tsx
import { HeroStatusOrFollow } from "@/components/detail/hero-status-or-follow";
```

`StatusBadgeLive` deja de usarse directamente en la página (lo usa `HeroStatusOrFollow`): quitarlo del import de `item-status-context` (dejar solo `ItemStatusProvider`).

Sustituir la línea 208:

```tsx
        statusSlot={<StatusBadgeLive labels={statusLabels} />}
```

por:

```tsx
        statusSlot={
          <HeroStatusOrFollow
            itemType="book"
            itemId={book.id}
            isLoggedIn={Boolean(user)}
            statusLabels={statusLabels}
          />
        }
```

- [ ] **Step 2: Película — mismo cambio**

En `src/app/pelicula/[id]/page.tsx`: añadir `import { HeroStatusOrFollow } from "@/components/detail/hero-status-or-follow";`, quitar `StatusBadgeLive` del import de `item-status-context`, y sustituir la línea 171:

```tsx
        statusSlot={<StatusBadgeLive labels={statusLabels} />}
```

por:

```tsx
        statusSlot={
          <HeroStatusOrFollow
            itemType="movie"
            itemId={movie.id}
            isLoggedIn={Boolean(user)}
            statusLabels={statusLabels}
          />
        }
```

(Confirmado: la variable de la fila es `movie.id`.)

- [ ] **Step 3: Serie — mismo cambio**

En `src/app/serie/[id]/page.tsx`: añadir el import, quitar `StatusBadgeLive` del import de `item-status-context`, y sustituir la línea 207:

```tsx
        statusSlot={<StatusBadgeLive labels={statusLabels} />}
```

por:

```tsx
        statusSlot={
          <HeroStatusOrFollow
            itemType="series"
            itemId={series.id}
            isLoggedIn={Boolean(user)}
            statusLabels={statusLabels}
          />
        }
```

(Confirmado: la variable de la fila es `series.id`.)

- [ ] **Step 4: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint src/app/libro/[id]/page.tsx src/app/pelicula/[id]/page.tsx src/app/serie/[id]/page.tsx`
Expected: sin errores. (Si TS avisa de `StatusBadgeLive` importado-y-no-usado, es que quedó en algún import: quitarlo.)

- [ ] **Step 5: Commit**

```bash
git add src/app/libro/[id]/page.tsx src/app/pelicula/[id]/page.tsx src/app/serie/[id]/page.tsx
git commit -m "feat(ficha): «Seguir»/estado del hero en libro, película y serie"
```

---

### Task 5: `LogPanel` — placeholder de carga y retirada del `FollowButton`

La pestaña «Mi registro» ya no es el punto de entrada de «Seguir». La rama `!entry` deja de pintar `FollowButton` (con su selector de edición) y pasa a un placeholder de carga ligero (ventana transitoria: seguido optimista, `entry` aún llegando por revalidación). Se retira el `FollowButton` interno y `writeEditionChoice` (escritura en localStorage de la edición-al-seguir), ya sin llamador.

**Files:**
- Modify: `src/components/detail/log-panel.tsx` (rama `!entry` en `LogPanel`, líneas ~126-135; función `FollowButton` líneas ~153-218; helper `writeEditionChoice` líneas ~46-53; imports huérfanos)

**Interfaces:**
- Consumes: `useTranslations("item")` (para `item.following` como texto del placeholder).

- [ ] **Step 1: Sustituir la rama `!entry`**

En `LogPanel`, sustituir el bloque (líneas ~126-135):

```tsx
  if (!entry) {
    return (
      <FollowButton
        itemType={itemType}
        itemId={itemId}
        editions={editions}
        canContribute={canContribute}
      />
    );
  }
```

por:

```tsx
  if (!entry) {
    // Sin pase activo la pestaña "Mi registro" ni se enseña (ItemDetailTabs la
    // oculta), así que llegar aquí es la ventana transitoria del "Seguir" del
    // hero: estado optimista "planned" mientras la revalidación trae la entry.
    // Un placeholder breve, no el botón "Seguir" (que ahora vive en el hero).
    return <FollowingPlaceholder />;
  }
```

- [ ] **Step 2: Añadir el componente placeholder y borrar `FollowButton` + `writeEditionChoice`**

Borrar la función `FollowButton` completa (líneas ~153-218) y el helper `writeEditionChoice` (líneas ~46-53, con su comentario). En su lugar (donde estaba `FollowButton`) añadir:

```tsx
// Placeholder de la ventana transitoria tras pulsar "Seguir" en el hero: el
// estado ya es "planned" (optimista) pero la entry del servidor aún no ha
// llegado. Texto sobrio, centrado; desaparece solo cuando la revalidación monta
// ManagedLog.
function FollowingPlaceholder() {
  const t = useTranslations("item");
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {t("following")}
    </p>
  );
}
```

- [ ] **Step 3: Limpiar imports huérfanos**

Tras borrar `FollowButton` y `writeEditionChoice`, revisar y quitar imports que queden sin uso en `log-panel.tsx`. Candidatos a comprobar (borrar SOLO si ya no se usan en el resto del fichero):
- `EditionPicker` (`./edition-picker`) — lo usaba `FollowButton` y también `PassDataPanel`; **PassDataPanel lo sigue usando**, así que NO borrar.
- `addExistingItemToLibrary` — solo lo usaba `FollowButton`. Comprobar con grep dentro del fichero; si no queda uso, borrar el import.
- `editionChoiceStorageKey` (`@/lib/passes/edition-choice`) — lo usaban `writeEditionChoice` y el efecto de `PassDataPanel`; **PassDataPanel lo sigue usando** (lado lector, ver spec «cabo suelto»), así que NO borrar.

Comando de ayuda:
```bash
grep -nE "addExistingItemToLibrary|EditionPicker|editionChoiceStorageKey" src/components/detail/log-panel.tsx
```
Dejar solo los imports con al menos un uso restante.

- [ ] **Step 4: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint src/components/detail/log-panel.tsx`
Expected: sin errores (ni warnings de import/variable sin usar).

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/log-panel.tsx
git commit -m "refactor(ficha): «Mi registro» sin botón Seguir; placeholder de carga transitoria"
```

---

### Task 6: e2e — seguir desde el hero + visibilidad de la pestaña

Actualizar el helper `followItem` (ahora «Seguir» está en el hero y no hay prompt de edición) y añadir aserciones de que «Mi registro» está oculta antes de seguir y visible después.

**Files:**
- Modify: `e2e/pase-hub.spec.ts` (helper `followItem` líneas ~166-175; test «Regla 1 — Alta» líneas ~284-313)

**Interfaces:**
- Consumes: los cambios de Tasks 2-5 corriendo contra el dev server (`npm run dev`, BD dev).

- [ ] **Step 1: Simplificar `followItem`**

Sustituir la función `followItem` (líneas ~166-175) por:

```ts
// "Seguir" ahora vive en el HERO (visible desde cualquier pestaña), no dentro
// de la pestaña Mi registro. Ya no abre el selector de edición: la edición se
// difiere a cuando se empieza a leer (panel Progreso). Tras seguir, la app
// revela "Mi registro" y salta a ella.
async function followItem(page: Page) {
  await page.getByRole("button", { name: "Seguir" }).click();
}
```

- [ ] **Step 2: Reforzar «Regla 1 — Alta» con la visibilidad de la pestaña**

En el test «Regla 1 — Alta» (líneas ~284-313), tras `await page.goto(\`/libro/${bookId}?tab=log\`)` y antes de `await followItem(page)`, insertar la aserción de que la pestaña está oculta; y tras seguir, que aparece. Sustituir el cuerpo desde el `goto` hasta el primer `expect(statusBadge...)` por:

```ts
    // Deep link a ?tab=log de un ítem AÚN no seguido: la pestaña "Mi registro"
    // no existe todavía, así que la ficha cae en "Información".
    await page.goto(`/libro/${bookId}?tab=log`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByRole("button", { name: "Mi registro" }),
    ).toHaveCount(0);

    // "Seguir" es accesible en el hero. Al seguir, la obra pasa a Pendiente y
    // aparece la pestaña "Mi registro".
    await followItem(page);
    await expect(statusBadge(page, "Pendiente")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Mi registro" }),
    ).toBeVisible({ timeout: 15_000 });
```

(El resto del test — la comprobación de `/coleccion?tab=todo` — se mantiene igual.)

- [ ] **Step 3: Ejecutar el ciclo de vida del libro**

Prerrequisito: dev server arrancado (`npm run dev`) y variables `TEST_USER_*` configuradas (si no lo están, el describe se `skip`ea — ver `test.skip` en el fichero).

Run: `npx playwright test e2e/pase-hub.spec.ts -g "ciclo de vida de un libro"`
Expected: PASS las 4 reglas (Alta, Auto-cierre, Relectura, y la Regla 6 del PR de borrado de pase si ya está en la rama; si no, solo 1/2/5).

Si falla por estricto-modo en el `getByRole("button", { name: "Seguir" })` (algún otro «Seguir» en la página), acotar al hero: usar `page.getByRole("button", { name: "Seguir" }).first()` o un `data-testid` en el botón del hero (añadir `data-testid="hero-follow"` en `HeroStatusOrFollow` y seleccionar por él).

- [ ] **Step 4: Commit**

```bash
git add e2e/pase-hub.spec.ts
git commit -m "test(e2e): seguir desde el hero y visibilidad condicional de «Mi registro»"
```

---

### Task 7: Verificación en navegador y typecheck/lint global

- [ ] **Step 1: Typecheck + lint de todo lo tocado**

Run: `npx tsc --noEmit && npx eslint src/components/detail/ src/app/libro/[id]/page.tsx src/app/pelicula/[id]/page.tsx src/app/serie/[id]/page.tsx e2e/pase-hub.spec.ts`
Expected: limpio.

- [ ] **Step 2: Verificación manual en navegador (skill `verify` / `qa-verifier`)**

Con `npm run dev`, para un **libro no seguido**:
1. La ficha abre en «Información»; el hero muestra el botón **«Seguir»**; **no** hay pestaña «Mi registro».
2. Pulsar «Seguir» → el hero cambia a la píldora **«Pendiente»**, aparece «Mi registro» y la ficha salta a esa pestaña.
3. Recargar → sigue seguido, pestaña visible, sin parpadeo del botón «Seguir» dentro de la pestaña.
4. Repetir en una **película** y una **serie** (la serie además debe conservar la pestaña «Episodios»).
5. Con sesión cerrada (anónimo): «Seguir» lleva a `/login`.

- [ ] **Step 3: Commit final si hubo ajustes de verificación**

```bash
git add -A
git commit -m "fix(ficha): ajustes tras verificación en navegador de Seguir-en-hero"
```

---

## Self-Review (cobertura del spec)

- **«Seguir» en el hero** → Tasks 3 + 4. ✅
- **Pestaña «Mi registro» condicional** → Tasks 1 + 2. ✅
- **Edición diferida** → Task 3 (hero añade directo) + Task 5 (retirada del selector-al-seguir). ✅
- **Revelar y saltar a la tab** → Task 3 (`?tab=log`) + Task 2 (sync por clave combinada). ✅
- **Anónimo → /login** → Task 3 (rama `!isLoggedIn`). ✅
- **Placeholder de carga** → Task 5. ✅
- **e2e** → Task 6. **Verificación navegador** → Task 7. ✅
- **Cabo suelto (efecto lector de edición-al-seguir en PassDataPanel)** → se deja inerte a propósito (spec, fuera de alcance): Task 5 Step 3 NO borra `editionChoiceStorageKey`. ✅
