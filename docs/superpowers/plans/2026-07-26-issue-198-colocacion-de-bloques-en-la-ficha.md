# Issue #198: la ficha lee la colocación curada de un bloque — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el orden y la zona que un curador da a un bloque-subsaga en `/saga/[id]/editar` sean lo que la ficha pinta.

**Architecture:** dos cambios, uno en una función pura y otro en el render. `groupMembers` pasa a ordenar los grupos por `positionInParent` y a llevar la colocación en el grupo; `saga-info.tsx` reparte los grupos entre la lista ordenada y la sección «Cuando quieras». Ni el cálculo del progreso ni la carga de datos se tocan.

**Tech Stack:** Next.js 16 (App Router, React 19, Server Components), Tailwind v4 con tokens Paper, next-intl (solo `es`), Vitest, Playwright.

**Issue:** [#198](https://github.com/borjar20/Biblioshare/issues/198), con la evidencia medida contra producción el 2026-07-26.
**Contexto:** la fase 2a (PR #201) dio al curador la forma de colocar bloques; esta issue es la mitad que faltaba. El spec de la fase 2b la declara **bloqueante**: `docs/superpowers/specs/2026-07-26-sagas-fase-2b-ventanas-design.md`.

## El estado que hay que arreglar, medido

Curado el Cosmere en producción el 2026-07-26:

| bloque | hueco curado | zona | lo que pinta la ficha hoy |
|---|---|---|---|
| Elantris | 2 | fijo | **el quinto** |
| Nacidos de la Bruma. Era 1 | 3 | fijo | el segundo |
| El Aliento de los Dioses | 4 | fijo | el cuarto |
| El Archivo de las Tormentas | 5 | fijo | **el primero** |
| Nacidos de la Bruma. Era 2 | — | **libre** | como un grupo normal |
| Novelas secretas | — | **libre** | como un grupo normal |

Son **dos fallos con la misma raíz** —que la ficha nunca mira las columnas `*_in_parent`—, y hay que arreglar los dos:

1. **El orden.** `groupMembers` ordena los grupos por el `position` **mínimo de sus miembros**. Como *Elantris* tiene su única obra sin numerar y *Archivo* tiene la suya en el 1, el orden sale invertido respecto de lo curado.
2. **La zona.** `saga-info.tsx` construye `freeMembers` filtrando `m.placement === "libre"` sobre los **miembros**, así que un bloque con `placementInParent === "libre"` no entra nunca ahí: se sigue pintando en la lista ordenada, indistinguible de los colocados.

## Global Constraints

- **El progreso no se toca.** `computeProgress` sigue recibiendo todos los grupos y `countedKeys` sigue decidiendo qué cuenta. La colocación (`fijo`/`libre`) **nunca** afecta al denominador; solo `optional` lo hace. Hoy el Cosmere marca 9 de 12 y **tiene que seguir marcando 9 de 12** al acabar.
- **`groupMembers` sigue devolviendo TODOS los grupos**, incluidos los `libre`. El reparto entre la lista ordenada y «Cuando quieras» es del render. Filtrar en la función pura rompería los segmentos de color del hero, que se emiten recorriendo `groups`.
- **La colocación curada manda; donde no la haya, no se inventa.** Un bloque sin `positionInParent` conserva exactamente el criterio de hoy (menor `position` de sus miembros, desempate por nombre). En producción hay **6 bloques sin colocar** de otros padres: no pueden moverse de sitio por este cambio.
- **Vocabulario ya fijado**: «Cuando quieras» para la zona `libre`, «opcional» para lo que no cuenta, «Nexo» para el grupo de miembros directos. Todo por `next-intl`, namespace `saga`, un solo idioma.
- **Node 22** (`fnm use 22`) antes de `npx vitest` o `npx playwright test`. Un solo `next dev`, en el 3000; Playwright reutiliza el que haya.

## Fuera de alcance, y por qué

- **`main-order.ts`** (el orden del timeline y del mapa) sigue derivando el orden de bloques del grafo o del `position` mínimo. No se toca aquí: su rama de grafo muere en la fase 3, y tocarlo ahora obligaría a mantener dos formas del mismo fichero durante toda la fase. La issue es de la **ficha**.
- **Intercalar los miembros directos entre los bloques.** En el editor la secuencia es una sola numeración: *Arcanum Ilimitado* es el hueco 1 y *Elantris* el 2. En la ficha, los miembros directos son el grupo «Nexo» y se pintan **al final**, así que *Arcanum* seguirá saliendo el último aunque esté curado el primero. Es una contradicción menor de la misma familia, pero arreglarla significa convertir las secciones de la ficha en una lista plana intercalada — otro diseño, no un arreglo. **Se abre como issue en la última tarea.**

---

## Estructura de ficheros

| Fichero | Qué cambia |
|---|---|
| `src/lib/sagas/group-members.ts` | `MemberGroup` gana la colocación; `groupMembers` ordena por ella |
| `src/lib/sagas/group-members.test.ts` | casos del orden nuevo y del fallback |
| `src/components/saga/saga-info.tsx` | reparte grupos entre lista ordenada y «Cuando quieras» |
| `messages/es.json` | una clave nueva para el bloque libre |
| `e2e/sagas-colocacion-bloques.spec.ts` | **nuevo**: la colocación curada se ve en la ficha |

---

### Task 1: El grupo lleva su colocación, y el orden sale de ella

**Files:**
- Modify: `src/lib/sagas/group-members.ts`
- Test: `src/lib/sagas/group-members.test.ts`

**Interfaces:**
- Consumes: `SagaChildRef` de `./types`, que **ya trae** `positionInParent`, `placementInParent` y `optionalInParent` (los añadió la fase 2a).
- Produces: `MemberGroup` con dos campos nuevos, `positionInParent: number | null` y `placementInParent: SagaPlacement | null`. Los consume `saga-info.tsx` en la Task 2.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir a `src/lib/sagas/group-members.test.ts`, dentro del `describe("groupMembers", ...)` que ya existe.

**Usa los helpers que el fichero ya tiene, no inventes otros**: `member(over: Partial<DetailMember>)` recibe **un objeto** (no argumentos posicionales), y las hijas se escriben como literales `SagaChildRef` igual que el `const children` de la cabecera. El fichero ya importa `DetailMember` y `SagaChildRef` de `./types`.

```ts
  it("la colocación curada manda sobre el menor `position` de los miembros", () => {
    // El caso real del Cosmere: Elantris está curado en el hueco 2 y su única
    // obra no tiene número; Archivo está en el 5 y su primera obra es la 1. Con
    // el criterio viejo salía Archivo primero, contradiciendo al curador.
    const curados: SagaChildRef[] = [
      { id: "elantris", name: "Elantris", accentColor: null, positionInParent: 2, placementInParent: "fijo", optionalInParent: false },
      { id: "archivo", name: "El Archivo de las Tormentas", accentColor: null, positionInParent: 5, placementInParent: "fijo", optionalInParent: false },
    ];
    const groups = groupMembers(
      [
        member({ itemId: "elantris-1", groupSagaId: "elantris", position: null }),
        member({ itemId: "camino", groupSagaId: "archivo", position: 1, placement: "fijo" }),
      ],
      curados,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["elantris", "archivo"]);
  });

  it("un bloque sin colocar va DETRÁS de los colocados", () => {
    const mezcla: SagaChildRef[] = [
      { id: "sin", name: "Sin colocar", accentColor: null, positionInParent: null, placementInParent: null, optionalInParent: false },
      { id: "con", name: "Con hueco", accentColor: null, positionInParent: 9, placementInParent: "fijo", optionalInParent: false },
    ];
    const groups = groupMembers(
      [
        member({ itemId: "a", groupSagaId: "sin", position: 1, placement: "fijo" }),
        member({ itemId: "b", groupSagaId: "con", position: 2, placement: "fijo" }),
      ],
      mezcla,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["con", "sin"]);
  });

  it("entre bloques sin colocar se conserva el criterio de siempre", () => {
    // Las 6 subsagas sin colocar que hay hoy en prod no pueden moverse de sitio
    // por este cambio. `children` (el const de la cabecera) son justo eso: dos
    // hijas sin colocar.
    const groups = groupMembers(
      [
        member({ itemId: "b4", groupSagaId: "vapor", position: 4, placement: "fijo" }),
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1, placement: "fijo" }),
      ],
      children,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["ceniza", "vapor"]);
  });

  it("el grupo lleva la colocación del bloque, para que el render pueda repartir", () => {
    const libres: SagaChildRef[] = [
      { id: "secretas", name: "Novelas secretas", accentColor: null, positionInParent: null, placementInParent: "libre", optionalInParent: false },
    ];
    const groups = groupMembers([member({ itemId: "a", groupSagaId: "secretas" })], libres);
    expect(groups[0].placementInParent).toBe("libre");
    expect(groups[0].positionInParent).toBeNull();
  });

  it("el grupo de miembros directos no es un bloque: no tiene colocación", () => {
    const groups = groupMembers([member({ itemId: "a", position: 1, placement: "fijo" })], []);
    expect(groups[0].sagaId).toBeNull();
    expect(groups[0].placementInParent).toBeNull();
  });
```

> El tercer caso es **el mismo escenario** que la prueba «agrupa por hija directa y ordena grupos por su menor position» que ya está en el fichero. Es deliberado: aquella fija el comportamiento viejo sin decir por qué sobrevive, y esta deja escrito que sobrevive **solo** para los bloques sin colocar. Si al implementar te parece redundante, **no borres la vieja** — renómbrala para que su nombre diga «sin colocar», y quédate con una sola.

- [ ] **Step 2: Ejecutarlas y verlas fallar**

```bash
fnm use 22; npx vitest run src/lib/sagas/group-members.test.ts
```

Esperado: fallan las cuatro primeras (orden equivocado y `placementInParent` inexistente); `tsc` también se quejará del campo que no existe.

- [ ] **Step 3: Ampliar el tipo**

En `src/lib/sagas/group-members.ts`, importar `SagaPlacement` de `./types` y añadir a `MemberGroup`:

```ts
export type MemberGroup = {
  /** null = grupo de miembros directos («Nexo» si hay hijas; único grupo si no) */
  sagaId: string | null;
  name: string | null;
  accent: SagaAccentToken;
  members: DetailMember[];
  /** Colocación del bloque dentro de ESTA saga (`sagas.*_in_parent`). Las dos
   *  son null en el grupo de miembros directos, que no es un bloque, y en un
   *  bloque sin clasificar. El render las usa para repartir los grupos entre la
   *  lista ordenada y «Cuando quieras» (issue #198); el progreso NO las mira. */
  positionInParent: number | null;
  placementInParent: SagaPlacement | null;
};
```

- [ ] **Step 4: Ordenar por la colocación curada**

Sustituir el `.sort(...)` de `childGroups`:

```ts
  // La colocación curada manda (issue #198): hasta la fase 2a no había forma de
  // expresarla, así que el orden salía del `position` MÍNIMO de los miembros
  // del bloque — una heurística que ahora contradice al curador (Elantris,
  // curado en el hueco 2, salía el quinto porque su única obra no tiene
  // número). Un bloque sin colocar conserva esa heurística y cae detrás: es lo
  // único que había antes, y en prod hay 6 bloques así que no deben moverse.
  const childGroups = children
    .filter((c) => buckets.has(c.id))
    .sort((a, b) => {
      if (a.positionInParent !== null && b.positionInParent !== null) {
        return a.positionInParent - b.positionInParent || a.name.localeCompare(b.name);
      }
      if (a.positionInParent !== null) return -1;
      if (b.positionInParent !== null) return 1;
      const ma = minPos(buckets.get(a.id)!);
      const mb = minPos(buckets.get(b.id)!);
      if (ma !== mb) return ma - mb;
      return a.name.localeCompare(b.name);
    });
```

Y propagar los dos campos al construir los grupos:

```ts
  const groups: MemberGroup[] = childGroups.map((c) => ({
    sagaId: c.id,
    name: c.name,
    accent: accentFor(c),
    members: buckets.get(c.id)!,
    positionInParent: c.positionInParent,
    placementInParent: c.placementInParent,
  }));
```

Y en el grupo de miembros directos, que **no** es un bloque:

```ts
    groups.push({
      sagaId: null,
      name: null,
      accent: children.length > 0 ? "beige" : "terracota",
      members: direct,
      positionInParent: null,
      placementInParent: null,
    });
```

- [ ] **Step 5: Ejecutar la suite entera**

```bash
fnm use 22; npx vitest run; npx tsc --noEmit
```

Esperado: todo en verde. **Si cae algún test existente de `group-members`, léelo antes de tocarlo**: puede estar fijando el orden viejo con datos que ahora tienen colocación, y en ese caso lo que hay que actualizar es el fixture, no la aserción.

- [ ] **Step 6: Inyección de fallo**

Revertir el `sort` al criterio viejo (solo `minPos`). **Deben caer** «la colocación curada manda» y «un bloque sin colocar va detrás», y **no** «entre bloques sin colocar se conserva el criterio de siempre». Deshacer.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/group-members.ts src/lib/sagas/group-members.test.ts
git commit -m "fix(sagas): la ficha ordena los bloques por su colocación curada (#198)"
```

---

### Task 2: «Cuando quieras» acoge también a los bloques

**Files:**
- Modify: `src/components/saga/saga-info.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `MemberGroup.placementInParent` (Task 1).
- Produces: nada que consuma otro módulo; es el render.

Hoy la sección «Cuando quieras» solo recoge **obras** (`m.placement === "libre"`). Un bloque `libre` se queda en la lista ordenada. Al acabar esta tarea, la sección contiene las dos cosas: las obras sueltas y los bloques enteros con su cabecera y su rejilla — la misma forma que ya tienen como grupo, pero bajo este título.

- [ ] **Step 1: Repartir los grupos**

En `SagaInfo`, junto a `freeMembers` y `unclassified`:

```tsx
  // Issue #198: un bloque `libre` es una entrada sin hueco, igual que una obra
  // `libre`, así que vive en «Cuando quieras» y no en la lista ordenada. Se
  // reparte AQUÍ y no en `groupMembers` a propósito: esa función tiene que
  // seguir devolviendo todos los grupos porque `computeProgress` los recorre
  // para emitir los segmentos de color del hero.
  const orderedGroups = groups.filter((g) => g.placementInParent !== "libre");
  const freeGroups = groups.filter((g) => g.placementInParent === "libre");
```

Y cambiar el `groups.map(...)` de la lista ordenada por `orderedGroups.map(...)`. Ojo con `isSoleDirectGroup`, que hoy compara contra `groups.length`: pasa a comparar contra `orderedGroups.length`, o una saga con un único grupo directo y un bloque libre dejaría de pintar su cabecera cuando debería seguir sin pintarla — y al revés.

- [ ] **Step 2: Pintar los bloques libres en la sección**

Sustituir el bloque `{freeMembers.length > 0 && (...)}` por uno que cubra las dos cosas:

```tsx
      {/* Los `libre` salen de la columna del orden y viven aquí: su «dónde» no
          es un hueco. Ojo, esto NO es lo mismo que `optional` — un libre puede
          contar perfectamente en el progreso (spec 2026-07-25, «Dos ejes
          ortogonales»). Desde la #198 la sección acoge dos formas: obras
          sueltas y bloques-subsaga enteros, que se pintan con su cabecera
          porque un bloque sin sus obras no dice nada. */}
      {(freeMembers.length > 0 || freeGroups.length > 0) && (
        <section>
          <h2 className="mb-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("freeSection")}
          </h2>
          <div className="flex flex-col gap-5">
            {freeMembers.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                {freeMembers.map((m) => (
                  <li key={`${m.itemType}-${m.itemId}`}>
                    <MemberCell m={m} labels={cellLabels} />
                  </li>
                ))}
              </ul>
            )}
            {freeGroups.map((group) => {
              const eligible = group.members.filter((m) => m.placement !== "libre");
              if (eligible.length === 0) return null;
              return (
                <div key={group.sagaId ?? "free-nexus"}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`h-[15px] w-1 rounded-full ${SAGA_ACCENT[group.accent].tick}`} />
                    <h3 className="font-serif text-[15px] font-semibold">
                      {group.name ?? t("nexusGroup")}
                    </h3>
                    <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                      {t("freeBlockHint")}
                    </span>
                    <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">
                      {eligible.length}
                    </span>
                  </div>
                  <GroupBody members={eligible} labels={cellLabels} />
                </div>
              );
            })}
          </div>
        </section>
      )}
```

Clave nueva en `messages/es.json`, namespace `saga`, junto a `freeSection`:

```json
"freeBlockHint": "sin hueco fijo",
```

- [ ] **Step 3: Comprobar tipos y suite**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run
```

Esperado: limpio y en verde.

- [ ] **Step 4: Verificar en el navegador contra la semilla QA**

Levanta la vista con el flujo de `docs/TESTING.md` y comprueba en una saga de dev con subsagas que (a) los bloques colocados salen en su orden y (b) un bloque marcado `libre` aparece bajo «Cuando quieras» con su cabecera y sus obras, y **no** en la lista de arriba. Si no hay ninguna saga de dev con un bloque `libre`, márcalo tú desde `/saga/<id>/editar` — es el mismo gesto que en producción — y déjalo como estaba al terminar.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/saga-info.tsx messages/es.json
git commit -m "fix(sagas): un bloque libre vive en «Cuando quieras», no en el orden (#198)"
```

---

### Task 3: E2E, verificación contra el Cosmere real y cierre

**Files:**
- Create: `e2e/sagas-colocacion-bloques.spec.ts`
- Modify: `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`

- [ ] **Step 1: Escribir el e2e**

Cubre lo que las pruebas unitarias no pueden: que lo curado en el editor se ve en la ficha, de punta a punta.

```ts
// e2e/sagas-colocacion-bloques.spec.ts
import { expect, test, type Page } from "@playwright/test";

// Mismo universo QA y misma sesión que el resto de specs de sagas.
const UNIVERSO = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

/** Colocación de las hijas directas, para restaurar al terminar. */
async function fetchChildren() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sagas?parent_saga_id=eq.${UNIVERSO}&select=id,position_in_parent,placement_in_parent`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  return res.json() as Promise<Array<{ id: string; position_in_parent: number | null; placement_in_parent: string | null }>>;
}

async function restore(rows: Awaited<ReturnType<typeof fetchChildren>>) {
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${r.id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        position_in_parent: r.position_in_parent,
        placement_in_parent: r.placement_in_parent,
      }),
    });
  }
}

test("un bloque marcado libre en el editor aparece en «Cuando quieras» de la ficha", async ({ page }) => {
  const before = await fetchChildren();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO}/editar`);

    // Mover el primer bloque de la secuencia a «Cuando quieras» desde su hoja.
    const firstBlock = page.locator('[data-testid="sequence-row"][data-key^="s:"]:visible').first();
    const blockName = (await firstBlock.locator("p").first().innerText()).trim();
    await firstBlock.getByRole("button", { name: /^Acciones de / }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cuando quieras" }).click();
    await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
    await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();

    // Y en la ficha ya no está en la lista de arriba, sino bajo «Cuando quieras».
    await page.goto(`/saga/${UNIVERSO}`);
    const free = page.locator("section").filter({ hasText: "Cuando quieras" });
    await expect(free.getByRole("heading", { name: blockName })).toBeVisible();
  } finally {
    await restore(before);
  }
});

test("el orden curado de los bloques es el que pinta la ficha", async ({ page }) => {
  const before = await fetchChildren();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO}/editar`);

    // Bajar un hueco el primer bloque y comprobar que la ficha lo refleja.
    const rows = page.locator('[data-testid="sequence-row"][data-key^="s:"]:visible');
    const movedName = (await rows.first().locator("p").first().innerText()).trim();
    await rows.first().getByRole("button", { name: /^Bajar un hueco/ }).click();
    await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
    await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();

    await page.goto(`/saga/${UNIVERSO}`);
    const headings = await page.locator("section h3:visible").allInnerTexts();
    expect(headings.indexOf(movedName)).toBeGreaterThan(0);
  } finally {
    await restore(before);
  }
});
```

**Antes de darlo por bueno**, consulta el estado real de las hijas de esa saga en dev (`select id, name, position_in_parent, placement_in_parent from sagas where parent_saga_id = '<universo>'`). Si no tiene al menos **dos** bloques colocados, el segundo test no discrimina: usa otra saga de la semilla o coloca los bloques como primer paso del propio test.

- [ ] **Step 2: Ejecutarlo dos pasadas seguidas**

```bash
fnm use 22; npx playwright test e2e/sagas-colocacion-bloques.spec.ts
```

Esperado: verde **dos veces seguidas** y dejando la semilla como estaba — la suite de sagas tiene historial de pasar solo en frío (#180, #182).

- [ ] **Step 3: Comprobar contra el Cosmere real, en producción**

Es lo que motivó la issue, así que se verifica ahí y no solo en dev. **Solo lectura y solo mirar la ficha**, sin tocar nada:

- `/saga/ba761e54-ab39-49cd-865c-97bf6ef74d47` debe pintar los bloques en el orden **Elantris → Nacidos Era 1 → El Aliento de los Dioses → El Archivo de las Tormentas**, y *Nacidos Era 2* y *Novelas secretas* bajo «Cuando quieras».
- El progreso **tiene que seguir diciendo 9 de 12 (75%)**. Si cambia, algo se ha colado en el denominador y hay que parar: la colocación no puede afectar al progreso.

Anota las dos comprobaciones con su resultado literal en el informe.

- [ ] **Step 4: Cerrar la issue y abrir la que queda**

- Comentar en **#198** con el antes/después del Cosmere y cerrarla.
- Comentar en el spec de la fase **2b** —o en su issue, si ya existe— que la dependencia bloqueante queda levantada.
- **Abrir issue nueva** por lo que este plan deja fuera a propósito: *los miembros directos de una saga se pintan siempre al final, en el grupo «Nexo», aunque su hueco curado los ponga antes* (en el Cosmere, *Arcanum Ilimitado* es el hueco 1 y sale el último). Explicar que arreglarlo significa convertir las secciones de la ficha en una lista plana intercalada, que es otro diseño y no un arreglo.

- [ ] **Step 5: Sincronizar la doc canónica**

- `docs/requirements/backlog.md`: en la fila de la fase 2a, anotar que la lectura de la colocación de bloques llegó después, con esta issue.
- `docs/requirements/decisiones.md`: **al final, sin reescribir nada**, una entrada con la decisión y su porqué — la colocación curada manda sobre la heurística del `position` mínimo, que se conserva **solo** para los bloques sin colocar; y el reparto de grupos se hace en el render y no en `groupMembers`, porque el progreso recorre esa lista para emitir los segmentos del hero.

- [ ] **Step 6: Comprobación final y commit**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run; npm run lint
```

Esperado: `tsc` limpio, suite en verde, y en `lint` **solo** el error preexistente de `signup-form.tsx` (#163).

```bash
git add -A
git commit -m "test(sagas): e2e de la colocación de bloques en la ficha, y doc (#198)"
```
