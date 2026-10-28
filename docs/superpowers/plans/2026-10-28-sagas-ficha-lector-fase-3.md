# Ficha de saga para el lector, fase 3 («Entre amigos»): plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans. Los pasos usan casillas (`- [ ]`). Un implementador por árbol: las tareas van en serie.

**Objetivo:** añadir a `/saga/[id]` el bloque «Entre amigos» (issue #1540). Muestra a las personas que sigues con pases en las obras de la saga: por dónde va cada una y su nota media en la saga.

**Arquitectura:**
- **Lectura:** una nueva con sesión, `getSagaFriends`, que reúne tus seguidos aceptados, sus pases en las obras de la saga (filtrados por RLS) y sus identidades.
- **Derivación:** una pura, `deriveFriends`, que calcula por amigo qué lleva hecho, por dónde va y su media.
- **Montaje:** el componente `FriendsOnSaga` ocupa la columna derecha que la fase 1 dejó reservada junto a «Te toca». Va detrás de `<Suspense>` y la página no lo espera con `await`, igual que «Tu paso».

**Stack:** Next.js 16 (RSC), React 19, Supabase, Tailwind v4, next-intl, Vitest + Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-27-sagas-ficha-lector-design.md`](../specs/2026-10-27-sagas-ficha-lector-design.md), §4 («Entre amigos») y «Fases de entrega». Fases anteriores: los planes `2026-10-27-…-fase-1.md` y `2026-10-28-…-fase-2.md`.

## Decisiones de este plan

1. **«Amigos» son las personas que sigues con el follow aceptado** (`follows.follower_id = yo`, `status = 'accepted'`). No se incluye a quien te sigue a ti.
2. **Solo cuentan los que tienen pases visibles en las obras de la saga.** La spec también hablaba de «quien sigue la saga», pero `saga_follows` tiene RLS de solo dueño: no se puede leer si otro la sigue sin una migración, y este plan no toca el esquema. Queda fuera y se registra en `decisiones.md` como límite asumido.
3. **La visibilidad la decide RLS sobre `passes`** (`can_view_profile`). La lectura no filtra a mano por perfil público o privado: lo que la base no devuelve no aparece. Las notas ya son legibles hoy para la media comunitaria de la ficha.
4. **Qué se enseña por amigo:**
   - avatar y nombre, que enlazan a su perfil `/u/<username>`;
   - **«Va por X»:** la obra que tiene en curso. Si no tiene ninguna, la terminada más avanzada en el orden de la balda activa, con el texto «Terminó X».
   - **«La terminó»:** si ha terminado todas las obras que cuentan del orden;
   - una barra con terminadas sobre las que cuentan del orden;
   - su nota media en la saga, sobre sus últimos pases terminados con nota, en puntos;
   - **orden:** primero el más reciente en actividad (`finished_on` / `started_on` / `created_at`). Se ven los 4 primeros y el resto se resume en «y N más».
5. **El orden es el de la balda**, la misma lista `order` que ya recibe «Tu paso». Así «por dónde va» se mide igual que «Te toca».
6. Sin sesión, o sin amigos con pases, **el bloque no se pinta** y no hay estado vacío.

## Restricciones globales

- **Sin migraciones ni cambios de esquema.**
- **Sin `use cache`** (regla #437). La lectura depende de la sesión y va detrás de `<Suspense>`. La página no la espera con `await` y le pone un `.catch` que devuelve `null`.
- **El estado sale de `passes`, nunca de `library_entries`.** Las identidades salen de `profile_identities`, como `resolveUsers` en `src/lib/social/follows.ts`.
- **Las notas se guardan en la escala 1–10** y se enseñan con `formatDots` o `RatingDots`, nunca en crudo.
- **Copy, comentarios y commits en español.** Las claves nuevas van al namespace `saga` de `messages/es.json`.
- **Node 22:** antepón `export PATH="$(cygpath "$APPDATA")/fnm/node-versions/v22.23.1/installation:$PATH";` a cada `npx`/`npm`.
- **Un solo servidor en el puerto 3000, arrancado a mano**, y se para al acabar. En este worktree, `next dev` lleva `--webpack`. Los e2e van contra build de producción.
- **Tokens del sistema Paper**, nada de hex. Comprueba en `src/app/globals.css` que existen las utilidades que uses.
- **Finales de línea:** LF en el índice y CRLF en la copia de trabajo. Respeta lo que haya en cada fichero.

---

### Tarea 1: `deriveFriends` y `getSagaFriends`

**Ficheros:**
- Crear `src/lib/sagas/friends.ts` (pura) y `src/lib/sagas/friends.test.ts`.
- Crear `src/lib/sagas/get-saga-friends.ts` (lectura) y `src/lib/sagas/get-saga-friends.test.ts`.

**Interfaces:**

```ts
// friends.ts
export type FriendPass = {
  userId: string;
  itemKey: string;                 // `tipo:id`
  status: "planned" | "in_progress" | "completed" | "dropped";
  isActive: boolean;
  rating: number | null;           // 1–10
  startedOn: string | null;
  finishedOn: string | null;
  createdAt: string;
};
export type FriendIdentity = { userId: string; username: string; displayName: string | null; avatarUrl: string | null };
export type FriendsInput = {
  passes: FriendPass[];
  identities: FriendIdentity[];
  /** Mismo `order` que «Tu paso»: obras de la balda activa en orden, `tipo:id`. */
  order: Array<{ key: string; title: string; href: string; optional: boolean }>;
};
export type FriendOnSaga = {
  userId: string; username: string; displayName: string | null; avatarUrl: string | null;
  completed: number;               // obras del order que cuentan (no opcionales) terminadas
  counted: number;                 // obras del order que cuentan
  status: { kind: "reading"; title: string; href: string }   // tiene una en curso
        | { kind: "finished" }                               // ha terminado todas las que cuentan
        | { kind: "last"; title: string; href: string }      // última terminada en el orden
        | { kind: "started" };                               // solo pases planned/dropped de obras del order
  average: number | null;          // media 1–10 de su último pase terminado con nota por obra
  lastActivity: string;            // YYYY-MM-DD
};
export function deriveFriends(input: FriendsInput): FriendOnSaga[];

// get-saga-friends.ts
export async function getSagaFriends(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  order: FriendsInput["order"],
): Promise<FriendOnSaga[]>;   // [] sin sesión, sin seguidos o sin pases visibles
```

**Reglas de `deriveFriends`** (cada una con su test):

1. **Una entrada por `userId` con al menos un pase cuya `itemKey` esté en `order`.** Los pases de obras que no están en el orden se ignoran.
2. **Sin identidad, no hay entrada.** Si el `userId` no está en `identities`, se descarta: no se pinta un amigo sin nombre.
3. **`completed`:** claves distintas, no opcionales, con algún pase `completed`. **`counted`:** número de obras no opcionales del orden.
4. **`status`:**
   - Si tiene un pase `in_progress` con `isActive` en una obra del orden, es `reading`. Si tiene varios, gana el de mayor índice en el orden.
   - Si no, y `counted > 0 && completed === counted`, es `finished`.
   - Si no, y ha terminado alguna obra del orden, es `last` con la de mayor índice.
   - Si no, es `started`.
5. **`average`:** sale de la nota del último pase `completed` de cada obra. «Último» significa mayor `finishedOn`; un `finishedOn` nulo cuenta como más antiguo que cualquier fecha; el empate lo decide `createdAt`. Si ese último pase no tiene nota, la obra no aporta. Es `null` si ninguna aporta.
6. **`lastActivity`:** el máximo de `finishedOn ?? startedOn ?? createdAt.slice(0,10)` entre sus pases de obras del orden.
7. **Orden de la lista:** por `lastActivity` descendente; el empate lo decide `username` ascendente.

- [ ] **Paso 1: tests que fallan** (`friends.test.ts`), uno por regla. Usa helpers `fp(userId, key, extra)` e `id(userId)`.

  Incluye este caso: «un amigo con dos pases en curso en obras del orden muestra la de mayor índice».

- [ ] **Paso 2: comprueba que fallan. Paso 3: implementa `friends.ts`.**

  Reutiliza la lógica de «último pase terminado» de `src/lib/sagas/passage.ts`. Si `laterFinish` no está exportada, expórtala desde allí; no la copies.

- [ ] **Paso 4: comprueba que pasan.**

- [ ] **Paso 5: test de `getSagaFriends` con mock de Supabase.** Usa el patrón de `src/lib/sagas/get-saga-passage.test.ts`: objeto encadenable que registra `eq`, `in` e `is`. Casos:
  - **Sin sesión** (`detail.isAuthenticated === false` o `getCurrentUser()` nulo): devuelve `[]` y no consulta nada.
  - **Seguidos:** consulta `follows` con `select("followee_id")`, `.eq("follower_id", user.id)` y `.eq("status", "accepted")`. Sin seguidos, devuelve `[]` sin más consultas.
  - **Pases:** consulta `passes` con `.in("user_id", followees)`, `.eq("item_type", tipo)` y `.in("item_id", ids de ese tipo en detail.groups)`, una consulta por tipo presente.
  - **Un pase que RLS no devuelve no aparece:** el mock solo devuelve las filas «visibles» y la salida no contiene al amigo cuyo pase no se devolvió.
  - **Identidades:** consulta `profile_identities` solo con los `userId` que tienen pases devueltos.
  - **Errores:** si una consulta devuelve `error`, se lanza. La página ya lo envuelve en un `.catch`.

- [ ] **Paso 6: implementa `get-saga-friends.ts`.**
  - Usa el cliente de la petición, sin `use cache`.
  - Toma el usuario de `getCurrentUser()` de `@/lib/supabase/server` (como `get-saga-passage.ts`).
  - Deduplica los ids por tipo.
  - Arma `FriendPass` con `itemKey = \`${tipo}:${item_id}\`` y la identidad desde `profile_identities` (`user_id, username, display_name, avatar_url`; filtra filas con `user_id` o `username` nulos).
  - Termina con `deriveFriends`.

- [ ] **Paso 7:** ejecuta `npx vitest run src/lib/sagas/friends.test.ts src/lib/sagas/get-saga-friends.test.ts`, después eslint y `npx tsc --noEmit -p .`. Commit: `feat(sagas): deriveFriends y getSagaFriends para «Entre amigos»`.

---

### Tarea 2: componente `FriendsOnSaga`

**Ficheros:**
- Crear `src/components/saga/ficha/friends-on-saga.tsx` y su `.test.tsx`.
- Modificar `messages/es.json`.

**Interfaz:**
- `<FriendsOnSaga friends={Promise<FriendOnSaga[]>} />`: componente de servidor asíncrono. Devuelve `null` si la lista está vacía.
- `<FriendsOnSagaSkeleton />`.

**Qué pinta:**
- `<section data-testid="friends-on-saga">` con la tarjeta del sistema: `rounded-[14px] border border-border bg-surface p-4`, la misma altura visual que «Te toca».
- **Cabecera:** el eyebrow «Entre amigos» (mono, `text-accent`) y un resumen: «{n} personas que sigues están con esta saga».
- **Lista de hasta 4 filas**, cada una un `<li>`:
  - avatar redondo de 32 px (`next/image` con `avatarUrl`; sin avatar, las iniciales sobre `bg-surface-muted`);
  - nombre (`displayName ?? username`) enlazado a `/u/<username>`;
  - una línea de estado:
    - `reading`: «Va por **título**», con enlace a la obra;
    - `finished`: «La terminó» en `text-green`;
    - `last`: «Terminó **título**»;
    - `started`: «La tiene en la pila».
  - a la derecha, la media en `RatingDots size="sm"` si existe;
  - debajo, una barra fina con `completed/counted` (`bg-green`), con `aria-label` «{completed} de {counted}».
- **Si hay más de 4:** una línea final «y {n} más».
- **Esqueleto:** un bloque de unos 180 px con `Skeleton`.

**Claves (`saga`):**

```json
"friendsEyebrow": "Entre amigos",
"friendsSummary": "{count, plural, =1 {1 persona que sigues está con esta saga} other {# personas que sigues están con esta saga}}",
"friendsReading": "Va por <b>{title}</b>",
"friendsFinished": "La terminó",
"friendsLast": "Terminó <b>{title}</b>",
"friendsStarted": "La tiene en la pila",
"friendsProgress": "{completed} de {counted}",
"friendsMore": "y {count} más",
```

- [ ] **Tests** (jsdom). Simula `next-intl/server` como en `next-up-card.test.tsx`, incluido `rich`, y simula `next/image`. Casos:
  - con `[]`, no pinta nada;
  - con 2 amigos, aparecen sus nombres con enlace a `/u/<username>`;
  - aparece cada uno de los cuatro estados;
  - las iniciales salen cuando no hay avatar;
  - la media solo aparece si existe;
  - con 6 amigos, se ven 4 filas y «y 2 más».
- [ ] **Implementa y comprueba en verde.** Después, eslint y tsc. Commit: `feat(sagas): bloque «Entre amigos»`.

---

### Tarea 3: montaje, e2e y cierre documental

**Ficheros:**
- Modificar `src/app/saga/[id]/page.tsx`, `e2e/sagas-ficha-lector.spec.ts` y los documentos.

- [ ] **Página:** junto a `const passage = …`, añade:

```ts
// Misma regla que «Tu paso»: sin await (la ficha no espera) y si la lectura
// falla, el bloque no se pinta y la ficha sigue.
const friends = detail.isAuthenticated
  ? getSagaFriends(supabase, detail, order).catch((e) => { console.error("getSagaFriends", e); return []; })
  : Promise.resolve([]);
```

  `order` ya existe para «Tu paso». `getSagaFriends` solo necesita `{ key, title, href, optional }`, y el `order` actual tiene esos campos y más.

  Sustituye el comentario «Columna derecha reservada a «Entre amigos»» por:

```tsx
<Suspense fallback={detail.isAuthenticated ? <FriendsOnSagaSkeleton /> : null}>
  <FriendsOnSaga friends={friends} />
</Suspense>
```

- [ ] **Comprobación en vivo:** con `next dev --webpack` en el 3000, sin sesión, la ficha no tiene `friends-on-saga` y responde 200. Para el servidor al acabar.

- [ ] **e2e** en `e2e/sagas-ficha-lector.spec.ts`:
  - sin sesión, no existe `friends-on-saga`;
  - con sesión, si REST dice que el usuario de pruebas sigue a alguien con pases visibles en esa saga, el bloque existe y su número de filas (como máximo 4) cuadra; si no, el bloque no existe. El caso que se cumple se lee por REST, no se asume.

  Ejecútalos contra build de producción, junto con `sagas-v2.spec.ts`.

- [ ] **Docs:**
  - `decisiones.md`: entrada nueva al final con las 6 decisiones, incluido el límite de `saga_follows`.
  - backlog: marca la fase 3.
  - spec: actualiza el estado.
  - evidencia en `docs/testing/2026-10-28-sagas-ficha-lector-f3.md`.
  - `graph.json` según `docs/architecture/README.md`.

  Commits: e2e en uno y docs en otro.
