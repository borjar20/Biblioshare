# Accesos a «Sacar un lomo» y «Entre nosotros» — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Sorteo y Entre nosotros se encuentren desde Biblioteca, Inicio,
Comunidad, el perfil ajeno y los clubes, con nombres que digan lo que abren.

**Architecture:** El sorteo se abre fuera del Rincón por enlace directo
(`/coleccion/rincon?sorteo=1`), sin montar la hoja en otras páginas. Entre
nosotros gana una tarjeta en Comunidad, renombra el botón del perfil y acepta
`?personas=` para abrir el editor de grupo con miembros de un club
preseleccionados. Las personas se filtran siempre contra los candidatos (follows
aceptados), así que la URL no concede nada.

**Tech Stack:** Next.js 16 (App Router), React 19, next-intl, Supabase,
Vitest + Testing Library (jsdom) y Playwright.

Spec: `docs/superpowers/specs/2026-11-01-accesos-sorteo-entre-nosotros-design.md`.

## Global Constraints

- Copy en español, en `messages/es.json`. No hay otros locales que mantener.
- Ningún `use cache` nuevo (regla #437 de `AGENTS.md`).
- Vitest necesita Node 22. En PowerShell, en el MISMO comando:
  `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run <ruta>`.
  Comprueba antes `node --version`; si ya es v22, basta con `npx vitest run <ruta>`.
- Un solo `next dev`, en el puerto 3000. En un worktree, arráncalo a mano
  (`npm run dev`); el webServer de Playwright agota los 120 s.
- Commits que acaban con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tamaño máximo de un grupo de Entre nosotros: 10 personas contando al que mira.

## Mapa de ficheros

| Fichero | Cambio |
|---|---|
| `src/components/rincon/spine-draw.tsx` | prop `initialOpen`; al cerrar, quita `sorteo` de la URL |
| `src/components/rincon/spine-draw.test.tsx` | nuevo |
| `src/app/u/[username]/_tabs/rincon-tab.tsx` | prop `openDraw`, pasada a `SpineDraw` |
| `src/app/coleccion/rincon/page.tsx` | lee `?sorteo=1` |
| `src/lib/rincon/draw-href.ts` | nuevo: `DRAW_HREF` |
| `src/components/library/library-tools.tsx` | cuarta herramienta |
| `src/components/stats/later-shelf.tsx` | prop `showDraw` y enlace en la cabecera |
| `src/components/stats/today-block.tsx` | `showDraw` en el estado «en curso» |
| `src/app/comunidad/page.tsx` | tarjeta de Entre nosotros |
| `src/lib/comparisons/personas-query.ts` (+ test) | nuevo: parseo de `?personas=` |
| `src/components/comparisons/explorer.tsx` (+ test) | abre el editor con `?personas=` |
| `src/lib/clubs/followed-members.ts` (+ test) | nuevo: miembros del club que sigues |
| `src/app/club/[slug]/miembros/page.tsx` | botón Entre nosotros |
| `messages/es.json` | claves nuevas y `profile.compareWith` |
| `e2e/sorteo.spec.ts`, `e2e/ia-navegacion.spec.ts`, `e2e/entre-nosotros.spec.ts` | accesos nuevos y renombre |
| `docs/UI-GLOSARIO.md`, `docs/requirements/decisiones.md` | doc |

---

### Task 1: Enlace directo que abre el sorteo

**Files:**
- Create: `src/lib/rincon/draw-href.ts`
- Modify: `src/components/rincon/spine-draw.tsx`
- Modify: `src/app/u/[username]/_tabs/rincon-tab.tsx:37-45` y `:132`
- Modify: `src/app/coleccion/rincon/page.tsx`
- Test: `src/components/rincon/spine-draw.test.tsx` (nuevo)
- Test: `e2e/sorteo.spec.ts`

**Interfaces:**
- Produces: `DRAW_HREF = "/coleccion/rincon?sorteo=1"` (`@/lib/rincon/draw-href`);
  `SpineDraw({ pool, collections?, initialOpen? })`;
  `RinconTab({ userId, includeArchived, basePath, openDraw? })`.

- [ ] **Step 1: Escribe el test que falla**

`src/components/rincon/spine-draw.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { SorteoItem } from "./sorteo-logic";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
// La hoja real usa <dialog>.showModal y server actions; aquí basta con saber si está abierta.
vi.mock("./sorteo-sheet", () => ({
  SorteoSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog"><button type="button" onClick={onClose}>cerrar</button></div> : null,
}));
import { SpineDraw } from "./spine-draw";

const item: SorteoItem = {
  itemType: "book", itemId: "b1", title: "Libro", subtitle: null, coverUrl: null,
  metaText: "", estimatedMinutes: null, estimateText: null, fresh: false, collectionIds: [],
};
const ui = (props: Parameters<typeof SpineDraw>[0]) => (
  <NextIntlClientProvider locale="es" messages={messages}><SpineDraw {...props} /></NextIntlClientProvider>
);

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/coleccion/rincon?sorteo=1&archivados=1"); });
afterEach(cleanup);

describe("SpineDraw", () => {
  it("empieza cerrado sin initialOpen", () => {
    render(ui({ pool: [item] }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("abre la hoja al montar con initialOpen", () => {
    render(ui({ pool: [item], initialOpen: true }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("con el pool vacío ignora initialOpen y enseña la tarjeta vacía", () => {
    render(ui({ pool: [], initialOpen: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(messages.rincon.drawEmptyTitle)).toBeTruthy();
  });
  it("al cerrar la hoja abierta por URL quita sorteo y conserva el resto", () => {
    render(ui({ pool: [item], initialOpen: true }));
    fireEvent.click(screen.getByRole("button", { name: "cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/coleccion/rincon?archivados=1", { scroll: false });
  });
  it("al cerrar una hoja abierta con el botón no toca la URL", () => {
    render(ui({ pool: [item] }));
    fireEvent.click(screen.getByRole("button", { name: messages.rincon.drawButton }));
    fireEvent.click(screen.getByRole("button", { name: "cerrar" }));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/rincon/spine-draw.test.tsx`
Expected: FAIL. «abre la hoja al montar» y «quita sorteo» fallan porque
`initialOpen` no existe.

- [ ] **Step 3: Implementa**

`src/lib/rincon/draw-href.ts`:

```ts
// Enlace directo al Sorteo: el Rincón abre la hoja al llegar (spec 2026-11-01).
export const DRAW_HREF = "/coleccion/rincon?sorteo=1";
```

En `src/components/rincon/spine-draw.tsx`:

```tsx
import { useRouter } from "next/navigation";
```

Cambia la firma y el estado:

```tsx
export function SpineDraw({
  pool,
  collections = [],
  initialOpen = false,
}: {
  pool: SorteoItem[];
  collections?: SorteoCollection[];
  // `?sorteo=1` (DRAW_HREF): la hoja llega abierta. Con el pool vacío no hay
  // nada que sortear y se queda la tarjeta vacía.
  initialOpen?: boolean;
}) {
  const t = useTranslations("rincon");
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen && pool.length > 0);
  const [fromUrl, setFromUrl] = useState(initialOpen);

  function close() {
    setOpen(false);
    if (!fromUrl) return;
    // Sin `sorteo` en la URL, recargar o volver atrás no reabre la hoja.
    setFromUrl(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("sorteo");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }
```

y en el JSX de la hoja usa `onClose={close}` en lugar de `onClose={() => setOpen(false)}`.

En `src/app/u/[username]/_tabs/rincon-tab.tsx`, añade `openDraw` a las props:

```tsx
export async function RinconTab({
  userId,
  includeArchived,
  basePath,
  openDraw = false,
}: {
  userId: string;
  includeArchived: boolean;
  basePath: string;
  openDraw?: boolean;
}) {
```

y en el rail:

```tsx
      <SpineDraw pool={pool.items} collections={pool.collections} initialOpen={openDraw} />
```

En `src/app/coleccion/rincon/page.tsx`:

```tsx
type CornerPageProps = { searchParams: Promise<{ archivados?: string; sorteo?: string }> };
```

```tsx
  const { archivados, sorteo } = await searchParams;
```

```tsx
        <RinconTab userId={user.id} includeArchived={includeArchived} basePath="/coleccion/rincon" openDraw={sorteo === "1"} />
```

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/rincon/spine-draw.test.tsx src/app/coleccion/rincon/page.test.tsx`
Expected: PASS. `page.test.tsx` ya comprueba las props de `RinconTab` con
`toMatchObject`, así que `openDraw: false` no lo rompe.

- [ ] **Step 5: Añade el e2e**

Al final de `e2e/sorteo.spec.ts`:

```ts
// Enlace directo (spec 2026-11-01): Biblioteca e Inicio llevan aquí y la hoja
// llega abierta, sin pulsar la tarjeta.
test("?sorteo=1 abre la hoja al llegar y cerrarla limpia la URL", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");

  await page.goto("/coleccion/rincon?sorteo=1");
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  const sheet = page.getByRole("dialog");
  await expect(sheet.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");

  await expect(sheet.getByRole("heading", { name: /deja que decida/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/coleccion\/rincon$/);
});
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/rincon/draw-href.ts src/components/rincon/spine-draw.tsx src/components/rincon/spine-draw.test.tsx "src/app/u/[username]/_tabs/rincon-tab.tsx" src/app/coleccion/rincon/page.tsx e2e/sorteo.spec.ts
git commit -m "feat(rincon): ?sorteo=1 abre la hoja del sorteo al llegar"
```

---

### Task 2: «Sacar un lomo» en Biblioteca e Inicio

**Files:**
- Modify: `src/components/library/library-tools.tsx`
- Modify: `src/components/stats/later-shelf.tsx`
- Modify: `src/components/stats/today-block.tsx:49-52` y `:119`
- Modify: `messages/es.json` (`collection`, `today`)
- Test: `e2e/ia-navegacion.spec.ts:63-80`

**Interfaces:**
- Consumes: `DRAW_HREF` de la Task 1.
- Produces: `LaterShelf({ items, total, showDraw? })`.

- [ ] **Step 1: Actualiza el e2e de navegación (falla)**

En `e2e/ia-navegacion.spec.ts`, el test pasa a llamarse
«Biblioteca reúne Cuaderno, Retos y objetivos, Sacar un lomo y Estadísticas» y queda así:

```ts
      await expect(tools.getByRole("link")).toHaveText(["Cuaderno", "Retos y objetivos", "Sacar un lomo", "Estadísticas"]);
      for (const [name, path, heading] of [
        ["Cuaderno", "/notas", "Cuaderno"],
        ["Retos y objetivos", "/coleccion/rincon", "Retos y objetivos"],
        ["Sacar un lomo", "/coleccion/rincon?sorteo=1", "Retos y objetivos"],
        ["Estadísticas", "/estadisticas", "Estadísticas"],
      ]) {
```

El cuerpo del bucle compara la URL con `new RegExp(\`${path}$\`)`. El `?` de la
nueva ruta rompería la expresión, así que cambia esa línea por:

```ts
        await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === path);
```

Lee el resto del bucle: si después de navegar vuelve atrás, la hoja del sorteo
abierta no debe impedirlo. Si hace falta, cierra con
`await page.keyboard.press("Escape")` cuando `name === "Sacar un lomo"`, antes
de comprobar el encabezado.

- [ ] **Step 2: Comprueba que falla**

Con `npm run dev` arrancado en el puerto 3000:
Run: `npx playwright test e2e/ia-navegacion.spec.ts -g "Biblioteca reúne"`
Expected: FAIL. Solo hay tres enlaces.

- [ ] **Step 3: Implementa**

`messages/es.json`, en `collection` (tras `"goalsAndChallenges"`):

```json
    "drawTool": "Sacar un lomo",
```

y en `today` (tras `"later": "Para más tarde",`):

```json
    "drawLink": "Sacar un lomo",
```

`src/components/library/library-tools.tsx`:

```tsx
import { DiceIcon, NoteIcon, TargetIcon, TiersIcon } from "@/components/ui/icons";
import { DRAW_HREF } from "@/lib/rincon/draw-href";

const TOOLS = [
  { href: "/notas", key: "notebook", icon: NoteIcon },
  { href: "/coleccion/rincon", key: "goalsAndChallenges", icon: TargetIcon },
  // El Sorteo vive en el Rincón, pero «Retos y objetivos» no lo nombra.
  { href: DRAW_HREF, key: "drawTool", icon: DiceIcon },
  { href: "/estadisticas", key: "statistics", icon: TiersIcon },
] as const;
```

`src/components/stats/later-shelf.tsx`. Firma:

```tsx
export function LaterShelf({ items, total, showDraw = false }: { items: LibraryItem[]; total: number; showDraw?: boolean }) {
```

```tsx
      <Header total={total} showDraw={showDraw} />
```

Cabecera:

```tsx
import { DRAW_HREF } from "@/lib/rincon/draw-href";
```

```tsx
// `showDraw`: con algo en curso, el Sorteo no tiene tarjeta en el Inicio (solo
// la tiene «Tu siguiente historia»); este enlace es su acceso desde aquí.
async function Header({ total, showDraw }: { total: number; showDraw: boolean }) {
  const t = await getTranslations("today");
  const link = "inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:underline";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
        {t("later")}
      </span>
      <span className="flex items-center gap-3">
        {showDraw && <Link href={DRAW_HREF} className={link}>{t("drawLink")}</Link>}
        <Link href="/coleccion?status=planned" className={link}>
          {t("seeAll", { count: total })}
          <ChevronRightIcon className="h-3 w-3" />
        </Link>
      </span>
    </div>
  );
}
```

`src/components/stats/today-block.tsx`. Sustituye el bloque de `later` por:

```tsx
  // Dos estanterías iguales: la de «en curso» lleva además el enlace al
  // Sorteo; la de «Tu siguiente historia» no, porque ya lo tiene integrado.
  const laterShelf = (showDraw: boolean) =>
    planned.length > 0 ? (
      <LaterShelf items={planned.slice(0, LATER_SHOWN)} total={planned.length} showDraw={showDraw} />
    ) : null;
  const later = laterShelf(false);
```

y en `<TodayPicker … later={later}>` usa `later={laterShelf(true)}`.

- [ ] **Step 4: Comprueba que pasa**

Run: `npx playwright test e2e/ia-navegacion.spec.ts -g "Biblioteca reúne"`
Expected: PASS.

Run: `npx vitest run src/components/stats`
Expected: PASS.

Comprueba también en el navegador (preview en el puerto 3000), con un usuario
que tenga algo en curso y pendientes: en Inicio aparece «Sacar un lomo» junto a
«Ver todos» y lleva al Rincón con la hoja abierta.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/library-tools.tsx src/components/stats/later-shelf.tsx src/components/stats/today-block.tsx messages/es.json e2e/ia-navegacion.spec.ts
git commit -m "feat(biblioteca): acceso directo a Sacar un lomo desde Biblioteca e Inicio"
```

---

### Task 3: Tarjeta en Comunidad y botón del perfil

**Files:**
- Modify: `src/app/comunidad/page.tsx:44`
- Modify: `messages/es.json` (`community`, `profile.compareWith`)
- Test: `e2e/entre-nosotros.spec.ts:310-350`

- [ ] **Step 1: Actualiza el e2e (falla)**

En `e2e/entre-nosotros.spec.ts`, cambia las dos apariciones de
`{ name: 'Comparar', exact: true }` por `{ name: 'Entre nosotros', exact: true }`
(líneas ~313 y ~350) y el título del test a
`'profile «Entre nosotros» opens an unsaved pair and «Guardar como grupo» keeps it (#1484)'`.

- [ ] **Step 2: Comprueba que falla**

Run: `npx playwright test e2e/entre-nosotros.spec.ts -g "profile"`
Expected: FAIL. No encuentra el enlace «Entre nosotros».

- [ ] **Step 3: Implementa**

`messages/es.json`:

```json
    "compareWith": "Entre nosotros",
```

(en `profile`, sustituye «Comparar»), y en `community`:

```json
    "comparisons": "Entre nosotros",
    "comparisonsHint": "Compara lo que leéis y veis con la gente a la que sigues",
```

`src/app/comunidad/page.tsx`. Añade `ChevronRightIcon` a los imports:

```tsx
import { ChevronRightIcon } from "@/components/ui/icons";
```

y sustituye la línea 44 por:

```tsx
    {/* Antes un enlace suelto sin contexto: la tarjeta dice qué hay detrás. */}
    <Link href="/comunidad/entre-nosotros" className="group flex min-h-11 items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40">
      <span className="flex flex-col gap-1">
        <span className="font-serif text-lg font-semibold text-foreground">{t("comparisons")}</span>
        <span className="text-sm text-muted-foreground">{t("comparisonsHint")}</span>
      </span>
      <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-accent"/>
    </Link>
```

- [ ] **Step 4: Comprueba que pasa**

Run: `npx playwright test e2e/entre-nosotros.spec.ts -g "profile"`
Expected: PASS.

Run: `npx vitest run src/components/route-messages.test.tsx`
Expected: PASS.

Abre `/comunidad` en el preview, en claro y en oscuro, a 375 px y en
escritorio: la tarjeta no desborda y el enlace la ocupa entera.

- [ ] **Step 5: Commit**

```bash
git add src/app/comunidad/page.tsx messages/es.json e2e/entre-nosotros.spec.ts
git commit -m "feat(social): Entre nosotros como tarjeta en Comunidad y con su nombre en el perfil"
```

---

### Task 4: `?personas=` abre el editor de grupo con gente preseleccionada

**Files:**
- Create: `src/lib/comparisons/personas-query.ts`
- Test: `src/lib/comparisons/personas-query.test.ts` (nuevo)
- Modify: `src/components/comparisons/explorer.tsx:138-150`
- Test: `src/components/comparisons/explorer.test.tsx`

**Interfaces:**
- Produces: `PERSONAS_MAX = 9`;
  `personasFromQuery(raw: string | null, candidates: Candidate[], viewerId: string): string[]`
  (sin el que mira, sin repetidos, solo candidatos, como mucho `PERSONAS_MAX`);
  `personasHref(ids: string[]): string`.

- [ ] **Step 1: Escribe los tests que fallan**

`src/lib/comparisons/personas-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PERSONAS_MAX, personasFromQuery, personasHref } from './personas-query';

const candidates = ['me', 'b', 'c'].map(userId => ({ userId, name: userId, avatarUrl: null }));

describe('personasFromQuery', () => {
  it('keeps only candidates, without the viewer or repeats, in URL order', () => {
    expect(personasFromQuery('c,me,stranger,b,c', candidates, 'me')).toEqual(['c', 'b']);
  });
  it('is empty for a missing or blank value', () => {
    expect(personasFromQuery(null, candidates, 'me')).toEqual([]);
    expect(personasFromQuery(' , ', candidates, 'me')).toEqual([]);
  });
  it('caps the list so that the viewer still fits in a group of 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ userId: `p${i}`, name: `p${i}`, avatarUrl: null }));
    expect(personasFromQuery(many.map(p => p.userId).join(','), many, 'me')).toHaveLength(PERSONAS_MAX);
  });
});

describe('personasHref', () => {
  it('builds the atlas link with comma-separated ids', () => {
    expect(personasHref(['b', 'c'])).toBe('/comunidad/entre-nosotros?personas=b%2Cc');
  });
});
```

En `src/components/comparisons/explorer.test.tsx`, justo después del test
`'ignores ?con= for someone who is not an accepted follow'`:

```tsx
  it('opens the new-group editor with the followed people from ?personas= and clears it from the URL', async () => {
    const bea = '10000000-0000-4000-8000-000000000002';
    mocks.query = `personas=${bea},10000000-0000-4000-8000-000000000099`;
    render(<NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={[]} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }, { userId: bea, name: 'Bea', avatarUrl: null }]} viewerId="a"/></NextIntlClientProvider>);
    const sheet = screen.getByRole('dialog', { name: 'Crear grupo' });
    expect((within(sheet).getByRole('checkbox', { name: 'Bea' }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/comunidad/entre-nosotros', { scroll: false }));
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('lets ?con= win over ?personas=', async () => {
    const bea = '10000000-0000-4000-8000-000000000002';
    mocks.query = `con=${bea}&personas=${bea}`;
    render(<NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={[]} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }, { userId: bea, name: 'Bea', avatarUrl: null }]} viewerId="a"/></NextIntlClientProvider>);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(`with:${bea}`, 'all'));
    expect(screen.queryByRole('dialog', { name: 'Crear grupo' })).toBeNull();
  });
  it('opens the atlas as usual when ?personas= has nobody you follow', () => {
    mocks.query = 'personas=10000000-0000-4000-8000-000000000099'; render(ui([]));
    expect(screen.queryByRole('dialog', { name: 'Crear grupo' })).toBeNull();
    expect(screen.getByText('Compara con quien sigues')).toBeTruthy();
  });
```

- [ ] **Step 2: Comprueba que fallan**

Run: `npx vitest run src/lib/comparisons/personas-query.test.ts src/components/comparisons/explorer.test.tsx`
Expected: FAIL. `personas-query` no existe y el explorer ignora `?personas=`.

- [ ] **Step 3: Implementa**

`src/lib/comparisons/personas-query.ts`:

```ts
import type { Candidate } from './types';

/**
 * `?personas=` (spec 2026-11-01): opens the new-group editor with these people ticked, e.g. the
 * club members you follow. It grants nothing: ids outside the candidates (accepted, visible
 * follows) are dropped, and saving re-validates on the server.
 */
export const PERSONAS_MAX = 9; // a group holds 10 with the viewer

export function personasFromQuery(raw: string | null, candidates: Candidate[], viewerId: string): string[] {
  if (!raw) return [];
  const allowed = new Set(candidates.map(person => person.userId));
  const ids = raw.split(',').map(id => id.trim()).filter(id => id && id !== viewerId && allowed.has(id));
  return [...new Set(ids)].slice(0, PERSONAS_MAX);
}

export function personasHref(ids: string[]): string {
  return `/comunidad/entre-nosotros?${new URLSearchParams({ personas: ids.join(',') })}`;
}
```

En `src/components/comparisons/explorer.tsx`, importa:

```tsx
import { personasFromQuery } from '@/lib/comparisons/personas-query';
```

Sustituye la línea del estado `editor` (la 150 actual) por:

```tsx
  // ?personas= (club → atlas): the new-group editor opens with them ticked. ?con= and ?group= win.
  const [initialPersonas] = useState(() => withPerson || search.get('group') ? [] : personasFromQuery(search.get('personas'), candidates, viewerId));
  const [editor, setEditor] = useState<{ group: Group | null; people?: string[] } | null>(() => initialPersonas.length ? { group: null, people: [viewerId, ...initialPersonas] } : null);
```

y, tras los `useEffect` existentes (antes de `function selectGroup`):

```tsx
  // Ids out of the URL once the editor holds them: a reload must not reopen it.
  useEffect(() => { if (initialPersonas.length) router.replace(atlasHref(null, atlasUi.lens, atlasUi.islandMode), { scroll: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Si `atlasHref(null, 'default lens', default mode)` no devuelve exactamente
`/comunidad/entre-nosotros` en el test, revisa los valores por defecto de
`parseAtlasQuery`. El test fija la URL sin parámetros extra.

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/lib/comparisons/personas-query.test.ts src/components/comparisons`
Expected: PASS, incluidos todos los tests anteriores del explorer.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comparisons/personas-query.ts src/lib/comparisons/personas-query.test.ts src/components/comparisons/explorer.tsx src/components/comparisons/explorer.test.tsx
git commit -m "feat(social): ?personas= abre el editor de Entre nosotros con gente preseleccionada"
```

---

### Task 5: Botón «Entre nosotros» en los miembros del club

**Files:**
- Create: `src/lib/clubs/followed-members.ts`
- Test: `src/lib/clubs/followed-members.test.ts` (nuevo)
- Modify: `src/app/club/[slug]/miembros/page.tsx`
- Modify: `messages/es.json` (`club`, el bloque raíz de la línea ~1421)

**Interfaces:**
- Consumes: `personasHref`, `PERSONAS_MAX` (Task 4).
- Produces: `pickFollowedMembers(memberIds: string[], followeeIds: string[], viewerId: string): string[]`;
  `getFollowedClubMembers(clubId: string, viewerId: string): Promise<string[]>`.

- [ ] **Step 1: Escribe el test que falla**

`src/lib/clubs/followed-members.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
import { pickFollowedMembers } from './followed-members';

describe('pickFollowedMembers', () => {
  it('keeps the members you follow, without yourself, in roster order', () => {
    expect(pickFollowedMembers(['me', 'c', 'x', 'b'], ['b', 'c', 'z'], 'me')).toEqual(['c', 'b']);
  });
  it('is empty when you follow nobody in the club', () => {
    expect(pickFollowedMembers(['me', 'x'], ['z'], 'me')).toEqual([]);
  });
  it('caps at the people that fit in a group with you', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `p${i}`);
    expect(pickFollowedMembers(ids, ids, 'me')).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/lib/clubs/followed-members.test.ts`
Expected: FAIL (`followed-members` no existe).

- [ ] **Step 3: Implementa**

`src/lib/clubs/followed-members.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { readAllRows } from '@/lib/supabase/read-all-rows';
import { PERSONAS_MAX } from '@/lib/comparisons/personas-query';

// Club → Entre nosotros (spec 2026-11-01): only accepted follows can be compared, so the
// button carries the active members you follow. Per session: never cached (#437).
export function pickFollowedMembers(memberIds: string[], followeeIds: string[], viewerId: string): string[] {
  const following = new Set(followeeIds);
  return memberIds.filter(id => id !== viewerId && following.has(id)).slice(0, PERSONAS_MAX);
}

export async function getFollowedClubMembers(clubId: string, viewerId: string): Promise<string[]> {
  const client = await createClient();
  const [members, follows] = await Promise.all([
    readAllRows<{ user_id: string }>((from, to) => client.from('club_members')
      .select('user_id').eq('club_id', clubId).eq('status', 'active')
      .order('user_id').range(from, to)),
    readAllRows<{ followee_id: string }>((from, to) => client.from('follows')
      .select('followee_id').eq('follower_id', viewerId).eq('status', 'accepted')
      .order('followee_id').range(from, to)),
  ]);
  return pickFollowedMembers(members.map(row => row.user_id), follows.map(row => row.followee_id), viewerId);
}
```

Antes de seguir, comprueba la firma de `readAllRows` en
`src/lib/supabase/read-all-rows.ts` (el uso de arriba copia el de
`src/lib/comparisons/groups.ts:18`) y que `club_members` tenga
`club_id`, `user_id` y `status`, en `docs/requirements/data-model.md`.

`messages/es.json`, en el bloque `"club"` de la raíz (línea ~1421):

```json
    "compareMembers": "Entre nosotros",
    "compareMembersHint": "Compara lo que leéis y veis con los miembros del club a los que sigues",
```

`src/app/club/[slug]/miembros/page.tsx`. Imports:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getFollowedClubMembers } from "@/lib/clubs/followed-members";
import { personasHref } from "@/lib/comparisons/personas-query";
```

Añade la consulta al `Promise.all`:

```tsx
  const [initial, activities, followed, t] = await Promise.all([
    listClubDirectory(club.id, { filter: "all", page: 0 }),
    canModerate ? listClubActivities(club.id) : Promise.resolve([]),
    getFollowedClubMembers(club.id, user.id),
    getTranslations("club"),
  ]);
```

y dentro de `<ClubShell>`, antes de `<MemberDirectory …/>`:

```tsx
      {/* Sin nadie a quien sigas no hay con quién comparar: el botón no se pinta. */}
      {followed.length > 0 && (
        <Link
          href={personasHref(followed)}
          title={t("compareMembersHint")}
          className="mb-4 inline-flex min-h-11 items-center self-start rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          {t("compareMembers")}
        </Link>
      )}
```

Si `ClubShell` espera un único hijo, envuelve los dos en
`<div className="flex flex-col">…</div>`.

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/lib/clubs/followed-members.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores.

En el preview, abre `/club/<slug>/miembros` de un club donde sigas a alguien:
el botón lleva a Entre nosotros con el editor abierto y esas personas marcadas.
En un club donde no sigas a nadie, el botón no aparece.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/followed-members.ts src/lib/clubs/followed-members.test.ts "src/app/club/[slug]/miembros/page.tsx" messages/es.json
git commit -m "feat(clubes): botón Entre nosotros con los miembros que sigues"
```

---

### Task 6: Documentación y cierre

**Files:**
- Modify: `docs/UI-GLOSARIO.md` (fila **Sorteo**, línea ~183; y Entre nosotros)
- Modify: `docs/requirements/decisiones.md` (entrada nueva al final)

- [ ] **Step 1: Glosario**

En `docs/UI-GLOSARIO.md`, la fila **Sorteo** pasa a:

```markdown
| **Sorteo** | Ruleta, Random | El «Sacar un lomo»: el azar elige entre tus pendientes. | Rincón; «Sacar un lomo» en Biblioteca y en «Para más tarde» de Inicio (`/coleccion/rincon?sorteo=1`) |
```

Busca la fila de **Entre nosotros** (`grep -n "Entre nosotros" docs/UI-GLOSARIO.md`).
En su columna de ubicación deja: «Tarjeta en Comunidad; botón en el perfil
ajeno (con follow aceptado); botón en Miembros del club». Si no existe, añádela
en la misma tabla con ese texto y la descripción «Atlas que compara lo que leéis
y veis con la gente a la que sigues».

- [ ] **Step 2: Decisión**

Al final de `docs/requirements/decisiones.md`:

```markdown
## 2026-11-01 — Accesos al Sorteo y a Entre nosotros: enlaces, no hojas montadas

El Sorteo se abre fuera del Rincón con `/coleccion/rincon?sorteo=1`, no montando
la hoja en Biblioteca e Inicio. Así hay una sola implementación del sorteo y no
se añade `getSorteoPool` a cada render de Inicio. Se descartó cargar el pool al
pulsar (server action nueva) por coste frente a beneficio; se puede migrar sin
tirar nada si el salto de página molesta.

Entre nosotros acepta `?personas=` para abrir el editor de grupo con gente
preseleccionada (botón de Miembros del club). No concede nada: se filtra contra
los candidatos (follows aceptados) y el guardado vuelve a validar en servidor.
Spec: `docs/superpowers/specs/2026-11-01-accesos-sorteo-entre-nosotros-design.md`.
```

- [ ] **Step 3: Suite completa**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit; npm run lint`
Expected: sin errores.

- [ ] **Step 4: Issue de cobertura del club**

La spec pedía un e2e Club → editor, pero el fixture de Entre nosotros no crea
clubes. Ábrelo como issue (lee antes `docs/agents/issue-tracker.md`):

```bash
gh issue create --repo borjar20/Biblioshare --label "area:social,tipo:cobertura,P2" --title "e2e: botón Entre nosotros de Miembros del club abre el editor con los seguidos" --body-file <fichero con: qué cubre hoy (unitarios de pickFollowedMembers y del explorer con ?personas=), qué falta (fixture con club + follows y e2e del clic), y la trampa: solo cuentan follows aceptados y miembros active>
```

- [ ] **Step 5: Commit**

```bash
git add docs/UI-GLOSARIO.md docs/requirements/decisiones.md
git commit -m "docs: accesos al Sorteo y a Entre nosotros en glosario y decisiones"
```
