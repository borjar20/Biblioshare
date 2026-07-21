# Vista de actividad de club en PC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/club/[slug]/actividad/[id]` deje de ser una columna suelta y se pinte con el sidebar del club y un rail derecho, sin alterar el orden que hoy tiene en móvil.

**Architecture:** La página entra en `ClubShell`. Se añade un componente de layout `ActivityLayout` con tres ranuras (`railTop` / `body` / `railBottom`) que en móvil fluyen en orden DOM y en `lg` se recolocan con un grid explícito de dos columnas. Cada `DetailExtension` recibe ese layout como render prop y reparte su propio JSX sin partirse en dos componentes (conservando su fetch único).

**Tech Stack:** Next.js 16 App Router (RSC + `"use client"`), React 19, Tailwind v4, next-intl, Playwright, Vitest (solo funciones puras).

**Spec:** `docs/superpowers/specs/2026-07-21-actividad-club-pc-design.md`

## Global Constraints

- **Cero DOM duplicado para controles.** Prohibido resolver el responsive con `hidden lg:block` + `lg:hidden` sobre el mismo botón o encabezado. Razón en la nota sobre duplicados de `club-shell.tsx`. Se admiten exactamente dos excepciones, ambas decididas y registradas:
  1. Desdoblar **texto** dentro de un mismo elemento interactivo (el enlace de vuelta, Task 2).
  2. El `railExtra` de `ActivityLayout` (Task 1), que sí usa `hidden lg:block`. Es legítimo porque su contenido son **avatares no interactivos** más un contador: ningún locator los busca por rol, así que no pueden provocar el *strict mode violation* que motiva la regla. Si algún día `railExtra` lleva un control, esta excepción deja de valer.
- **`e2e/club-activity-changes.spec.ts` no se toca y debe seguir pasando.** Busca «Salir», «Modificar», «Finalizar», «Archivar» por rol: dos coincidencias = strict mode violation.
- **El orden móvil se preserva para `tierlist` y `criteria_challenge`.** Referencia: frames 4, 5, 7 y 8 de `Biblioshare_mockups/Paper - Clubes.html`. Orden: chip → título → descripción → participantes → acciones → progreso → tablero → clasificación. **Actualización (revisión final de rama, 2026-07-21):** en `list_challenge` y `buddy_read` el orden SÍ cambió, y se aceptó — ver la corrección en la spec, sección Verificación. `list_challenge`: la clasificación pasó de ir entre la rejilla y la matriz a ir después de la matriz y la regla. `buddy_read`: la tarjeta «Tu progreso» pasó a preceder al `<h2>` «Hitos» (antes era al revés), y se añadió «Próximo hito» al final.
- **Ninguna migración, ningún dato nuevo.** Todo lo que va al rail ya lo cargan los tableros.
- **Node 22:** el shell puede arrancar en 20.9. Activar con `fnm use 22` antes de `npx vitest` o `npm test`.
- **Un solo `next dev`, en el puerto 3000.** `npm run test:e2e` reutiliza el que haya.
- Textos de UI en `messages/es.json` bajo la clave `activity`. Nada de literales en JSX.

---

## File Structure

**Nuevos:**
- `src/components/clubs/activity-layout.tsx` — el layout de tres ranuras. Único responsable de la colocación por breakpoint.
- `src/lib/clubs/activities/next-checkpoint.ts` — deriva el próximo hito. Función pura.
- `src/lib/clubs/activities/next-checkpoint.test.ts` — su test unitario.
- `e2e/club-actividad-pc.spec.ts` — verifica shell, rail y ausencia de duplicados.

**Modificados:**
- `src/app/club/[slug]/actividad/[id]/page.tsx` — monta `ClubShell`.
- `src/components/clubs/activity-detail.tsx` — cabecera única sticky; provee el `Layout`.
- `src/lib/clubs/activities/kinds/types.ts` — nueva prop `Layout` en `DetailExtension`.
- `src/components/clubs/checkpoints/buddy-read-checkpoints.tsx`
- `src/components/clubs/list-challenge/list-challenge-board.tsx`
- `src/components/clubs/tierlist/tierlist-board.tsx`
- `src/components/clubs/criteria-challenge/criteria-challenge-board.tsx`
- `messages/es.json`

---

## Task 1: El layout de tres ranuras

Aísla toda la decisión de colocación en un componente sin lógica de negocio, para que los cuatro tableros solo declaren qué va en cada ranura.

**Files:**
- Create: `src/components/clubs/activity-layout.tsx`
- Modify: `src/lib/clubs/activities/kinds/types.ts:45-50`

**Interfaces:**
- Produces: `ActivityLayout`, componente con props `{ railTop?: ReactNode; body: ReactNode; railBottom?: ReactNode; railExtra?: ReactNode }`. `railExtra` es lo que aporta el padre (participantes) y se pinta al principio del rail en PC; en móvil no se pinta aquí (el padre ya lo tiene en su sitio).
- Produces: `ActivityLayoutProps`, tipo exportado.
- Produces: en `types.ts`, `DetailExtension` pasa a recibir además `Layout: ComponentType<ActivityLayoutProps>` y `railExtra: ReactNode`. `Layout` siempre es la referencia importada `ActivityLayout`, nunca un wrapper inline: un wrapper cambia de identidad en cada render y remonta el subárbol.

- [ ] **Step 1: Crear el layout**

Crear `src/components/clubs/activity-layout.tsx`:

```tsx
import type { ComponentType, ReactNode } from "react";

export type ActivityLayoutProps = {
  /** En móvil va ANTES del tablero; en PC, arriba del rail derecho. */
  railTop?: ReactNode;
  /** El tablero del tipo de actividad. Columna izquierda en PC. */
  body: ReactNode;
  /** En móvil va DESPUÉS del tablero; en PC, debajo en el rail. */
  railBottom?: ReactNode;
  /** Piezas que aporta ActivityDetailView al rail (participantes). Solo se
      pintan en PC: en móvil el padre ya las tiene en su posición del mockup. */
  railExtra?: ReactNode;
};

export type ActivityLayoutComponent = ComponentType<ActivityLayoutProps>;

// Tres ranuras, un solo DOM (spec, decisión 2). El orden del DOM ES el orden
// móvil, que fluye natural; en `lg` un grid explícito recoloca:
//
//   railTop      -> col 2, fila 1        body -> col 1, filas 1-2
//   railBottom   -> col 2, fila 2
//
// No se usa `hidden lg:block` para mover piezas: duplicaría controles y la
// suite corre a 1280 (ver la nota sobre duplicados en `club-shell.tsx`).
export function ActivityLayout({
  railTop,
  body,
  railBottom,
  railExtra,
}: ActivityLayoutProps) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_296px] lg:items-start lg:gap-7">
      {(railTop || railExtra) && (
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {/* railExtra solo existe en PC: en móvil el padre ya pintó
              participantes en su sitio del mockup. */}
          {railExtra && <div className="hidden lg:block">{railExtra}</div>}
          {railTop}
        </div>
      )}

      <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">{body}</div>

      {railBottom && (
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">{railBottom}</div>
      )}
    </div>
  );
}
```

> Nota sobre `railExtra`: es la única excepción al veto de `hidden lg:block`, y es legítima porque el contenido son **avatares no interactivos**, no un control que los locators busquen por rol. Si algún día lleva un botón, hay que replantearlo.

- [ ] **Step 2: Declarar el Layout en el contrato de kinds**

En `src/lib/clubs/activities/kinds/types.ts`, añadir el import y ampliar `DetailExtension`:

```ts
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
```

Y sustituir el bloque `DetailExtension` (líneas 45-50) por:

```ts
  // Contenido específico del kind que se inserta en ActivityDetailView, tras
  // el pool de ítems / opiniones genéricos de G. No gateado por
  // isParticipant -- cada extensión decide qué mostrar a quién (p.ej.
  // buddy_read enseña la lista de checkpoints a todo el club, decisión 7).
  //
  // `Layout` es el reparto en tres ranuras (spec 2026-07-21): el tablero NO se
  // parte en dos componentes -- los cuatro derivan de un solo fetch en estado
  // local -- solo distribuye su propio JSX.
  DetailExtension?: ComponentType<{
    activity: ActivityDetail;
    viewerId: string;
    isModerator: boolean;
    onChanged: () => void;
    // `clubSlug` lo añade la Task 4 (solo list_challenge lo necesita).
    // `Layout` es SIEMPRE la referencia importada `ActivityLayout` -- nunca un
    // wrapper construido en el padre. Un wrapper inline cambia de identidad en
    // cada render de ActivityDetailView (que se re-renderiza con cada
    // router.refresh()), y React remontaría el subárbol entero: se cerraría el
    // <details> de la matriz y se borraría el texto a medio escribir en el chat
    // de un hito. Por eso `railExtra` viaja como prop normal y el tablero lo
    // reenvía, en vez de capturarse en un closure.
    Layout: ComponentType<ActivityLayoutProps>;
    // Lo que el padre aporta al rail (participantes). El tablero no lo
    // interpreta: solo lo reenvía a `Layout`.
    railExtra: ReactNode;
  }>;
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: errores SOLO en los cuatro tableros y en `activity-detail.tsx`, por no pasar/aceptar todavía `Layout`. Ese es el andamio que las tareas 3-7 retiran. Ningún error dentro de `activity-layout.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activity-layout.tsx src/lib/clubs/activities/kinds/types.ts
git commit -m "feat(club): layout de tres ranuras para el detalle de actividad"
```

---

## Task 2: La página entra en el shell del club

Deliverable independiente: aunque los tableros aún no usen el rail, la pantalla ya deja de estar descuadrada.

**Files:**
- Modify: `src/app/club/[slug]/actividad/[id]/page.tsx`
- Modify: `src/components/clubs/activity-detail.tsx` (cabecera)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `ClubShell`, `ClubSidebar` de `@/components/clubs/club-shell`.
- Produces: `ActivityDetailView` acepta la prop nueva `clubSlug` ya existente; sin cambio de firma.

- [ ] **Step 1: Montar el shell en la página**

Sustituir el `return` de `src/app/club/[slug]/actividad/[id]/page.tsx` (líneas 36-46). Añadir antes los imports y la consulta de actividades:

```tsx
import { listClubActivities } from "@/lib/clubs/activities/core";
import { ClubShell, ClubSidebar } from "@/components/clubs/club-shell";
```

Y el cuerpo, tras `if (!activity || activity.clubId !== club.id) notFound();`:

```tsx
  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";
  // El sidebar necesita el pip de propuestas pendientes, igual que miembros/page.tsx.
  const activities = canModerate ? await listClubActivities(club.id) : [];
  const pendingProposals = activities.filter((a) => a.status === "proposed").length;

  // La actividad vive dentro del shell del club (spec 2026-07-21): sin esto la
  // pantalla perdía el sidebar en PC y quedaba en una columna suelta. NO se pasa
  // `desktopHeader`: la cabecera con las acciones se pinta una sola vez dentro
  // del contenido, porque duplicarla rompería los locators del e2e.
  return (
    <ClubShell
      sidebar={
        <ClubSidebar
          club={club}
          active="actividades"
          canModerate={canModerate}
          pendingProposals={pendingProposals}
        />
      }
    >
      <ActivityDetailView
        activity={activity}
        viewerId={user.id}
        viewerRole={club.viewerRole}
        clubSlug={slug}
        clubName={club.name}
      />
    </ClubShell>
  );
```

- [ ] **Step 2: Añadir el texto del enlace de vuelta**

En `messages/es.json`, dentro del objeto `activity`, añadir junto a las claves existentes:

```json
    "backToActivities": "Actividades",
```

- [ ] **Step 3: Cabecera única y sticky en `activity-detail.tsx`**

En `src/components/clubs/activity-detail.tsx` hay **dos** bloques de topbar idénticos (líneas 216-228 en la vista previa y 341-353 en la principal). Sustituir **ambos** por el mismo bloque nuevo:

```tsx
      {/* Topbar: en móvil «‹ nombre del club» (frame 4); en PC «‹ Actividades»,
          pegado bajo el topbar global. Un SOLO <Link> con dos textos por
          breakpoint -- se desdobla texto, nunca el control (spec, decisión 1). */}
      <div className="-mx-4 flex items-center gap-2.5 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:sticky lg:top-[var(--topbar-h)] lg:z-10 lg:-mx-8 lg:px-8">
        <Link
          href={`/club/${clubSlug}?tab=actividades`}
          className="flex min-w-0 items-center gap-2.5 text-foreground"
        >
          <span
            aria-hidden
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface transition-colors hover:bg-surface-muted"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </span>
          <span className="truncate font-serif text-sm font-semibold lg:hidden">
            {clubName}
          </span>
          <span className="hidden text-[13px] text-muted-foreground lg:inline">
            {t("backToActivities")}
          </span>
        </Link>
      </div>
```

El `aria-label={t("backToClub")}` desaparece: el enlace ya tiene texto accesible propio.

- [ ] **Step 4: Comprobar tipos y lint**

Run: `npx tsc --noEmit 2>&1 | grep -v "Layout"`
Expected: sin errores en `page.tsx` ni en la cabecera de `activity-detail.tsx`.

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Verificar a ojo en las dos anchuras**

Levantar el dev server si no hay ninguno (`npm run dev`, puerto 3000) y abrir una actividad de un club del que seas miembro.

- A 1280: aparece el sidebar del club a la izquierda, con «Actividades» marcada. La cabecera se queda pegada al hacer scroll.
- A 390: no hay sidebar; el topbar muestra `‹` + nombre del club, como antes.
- En ninguna de las dos hay dos botones «Salir».

- [ ] **Step 6: Commit**

```bash
git add src/app/club/\[slug\]/actividad/\[id\]/page.tsx src/components/clubs/activity-detail.tsx messages/es.json
git commit -m "feat(club): la actividad se pinta dentro del shell del club"
```

---

## Task 3: `ActivityDetailView` provee el layout

**Files:**
- Modify: `src/components/clubs/activity-detail.tsx:115-153` (`structureSection`)

**Interfaces:**
- Consumes: `ActivityLayout` de Task 1.
- Produces: el `DetailExtension` de cada kind recibe `Layout={ActivityLayout}` y `railExtra` con los participantes.

- [ ] **Step 1: Importar el layout**

En `src/components/clubs/activity-detail.tsx`:

```tsx
import { ActivityLayout, type ActivityLayoutProps } from "./activity-layout";
```

- [ ] **Step 2: Extraer el bloque de participantes a una constante**

En `ActivityDetailView`, justo después de `const overflow = …` (línea 105), añadir:

```tsx
  // Los participantes se pintan en su sitio del mockup en móvil, y además
  // viajan al rail en PC (`railExtra`). Una sola definición para las dos.
  const participantsBlock = (
    <div className="flex items-center gap-3">
      {activity.participants.length > 0 && (
        <span className="flex" aria-hidden>
          {activity.participants.map((participant) => (
            <span
              key={participant.userId}
              className="-ml-2 rounded-full ring-2 ring-background first:ml-0"
            >
              <UserAvatar
                name={participant.displayName || participant.username}
                avatarUrl={participant.avatarUrl}
                size={28}
              />
            </span>
          ))}
          {overflow > 0 && (
            <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full bg-surface-muted font-mono text-[10px] text-muted-foreground ring-2 ring-background">
              +{overflow}
            </span>
          )}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {t("participate", { count: activity.participantCount })}
      </span>
    </div>
  );
```

Sustituir por `{participantsBlock}` los dos bloques inline de participantes (líneas 253-279 de la vista previa y 377-403 de la principal). En la vista previa el bloque queda igual: en móvil es la única colocación y en PC el rail lo repite solo si hay `railExtra`, cosa que la previa no usa.

- [ ] **Step 3: Cablear el Layout en `structureSection`**

Sustituir el `DetailExtension` de `structureSection` (líneas 144-151) por:

```tsx
      {(isParticipant || activity.kind === "buddy_read") && DetailExtension && (
        <DetailExtension
          activity={activity}
          viewerId={viewerId}
          isModerator={isModerator}
          onChanged={refreshActivity}
          clubSlug={clubSlug}
          Layout={ActivityLayout}
          railExtra={participantsBlock}
        />
      )}
```

`Layout` es la referencia importada, sin envolver. Nada de `Layout={(props) => …}`:
un wrapper inline cambia de identidad en cada render y React remonta el subárbol —
se cerraría el `<details>` de la matriz y se perdería el texto a medio escribir en
el chat de un hito.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: los únicos errores restantes son los cuatro tableros, que aún no aceptan la prop `Layout`. Las tareas 4-7 los retiran uno a uno.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/activity-detail.tsx
git commit -m "feat(club): ActivityDetailView reparte el layout y los participantes"
```

---

## Task 4: `list_challenge` usa el rail

Se hace primero porque es el tablero con las tres piezas del reparto (railTop, body, railBottom) y el que cubre el e2e existente.

**Files:**
- Modify: `src/components/clubs/list-challenge/list-challenge-board.tsx`
- Modify: `src/components/clubs/activity-detail.tsx:485-491` (mover `LinkedActivities`)

**Interfaces:**
- Consumes: `ActivityLayoutProps` de Task 1.

- [ ] **Step 1: Aceptar la prop `Layout`**

En `list-challenge-board.tsx`, ampliar la firma (líneas 33-42):

```tsx
export function ListChallengeBoard({
  activity,
  viewerId,
  isModerator,
  clubSlug,
  Layout,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
  clubSlug: string;
  Layout: ComponentType<ActivityLayoutProps>;
  railExtra: ReactNode;
}) {
```

Con los imports:

```tsx
import type { ComponentType, ReactNode } from "react";
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
import { LinkedActivities } from "./linked-activities";
```

- [ ] **Step 2: Repartir el JSX en las tres ranuras**

Sustituir el `return` final (líneas 93-206) por:

```tsx
  return (
    <Layout
      railExtra={railExtra}
      railTop={
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("listChallengeProgress")}
          </h2>
          <ListChallengeSummary
            itemCount={activity.items.length}
            viewerCompleted={viewer?.completedKeys.length ?? 0}
            position={viewerRank}
            participantCount={view.participants.length}
          />
        </div>
      }
      body={
        <div className="flex flex-col gap-3">
          <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("listChallengeList")}
          </h3>
          {/* En PC la rejilla gana ancho: 8 columnas como el frame 2 del mockup. */}
          <div className="grid grid-cols-5 gap-2 lg:grid-cols-8">
            {activity.items.map((item) => {
              const done =
                viewer?.completedKeys.includes(itemKey(item.itemType, item.itemId)) ?? false;
              const itemClassName =
                "relative aspect-[2/3] overflow-hidden rounded-[5px] border border-border bg-surface-muted";
              const cover = (
                <>
                  {item.itemCoverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                    <img
                      src={item.itemCoverUrl}
                      alt={item.itemTitle}
                      className={`h-full w-full object-cover ${done ? "" : "opacity-55"}`}
                    />
                  )}
                  {done && (
                    <span className="absolute inset-0 grid place-items-center bg-status-completed/55">
                      <CheckIcon className="h-4 w-4 text-accent-foreground" />
                    </span>
                  )}
                </>
              );
              return canConnect ? (
                <button
                  key={item.id}
                  type="button"
                  title={item.itemTitle}
                  onClick={() => setSheetItem(item)}
                  className={itemClassName}
                >
                  {cover}
                </button>
              ) : (
                <Link
                  key={item.id}
                  href={itemHref(item.itemType, item.itemId)}
                  title={item.itemTitle}
                  className={itemClassName}
                >
                  {cover}
                </Link>
              );
            })}
          </div>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <ChevronDownIcon
                aria-hidden
                className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              />
              {t("listChallengeMatrix")}
            </summary>
            <div className="mt-3">
              <ListChallengeGrid items={activity.items} participants={view.participants} />
            </div>
          </details>

          {/* Esta línea es lo que hace legible la regla del reto: el progreso es
              DERIVADO, no se marca a mano -- y qué lo deriva depende de la
              modalidad (H3b). Sin ella, la rejilla es un misterio. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {completionMode === "any"
              ? t("listChallengeRuleOpen")
              : t("listChallengeRule", { start: view.windowStart, end: view.windowEnd })}
          </p>

          <ItemConnectSheet
            parentActivityId={activity.id}
            item={sheetItem}
            open={sheetItem !== null}
            onClose={() => setSheetItem(null)}
          />
        </div>
      }
      railBottom={
        <div className="flex flex-col gap-3">
          <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("listChallengeRanking")}
          </h3>
          <div className="flex flex-col">
            {ranked.map((p) => (
              <MemberRankRow
                key={p.userId}
                name={p.displayName || p.username}
                avatarUrl={p.avatarUrl}
                isViewer={p.isViewer}
                percent={
                  activity.items.length > 0
                    ? (p.completedKeys.length / activity.items.length) * 100
                    : 0
                }
                counter={`${p.completedKeys.length}/${activity.items.length}`}
                fill="accent"
              />
            ))}
          </div>
          <LinkedActivities activity={activity} isCurator={isCurator} clubSlug={clubSlug} />
        </div>
      }
    />
  );
```

- [ ] **Step 3: Quitar `LinkedActivities` de `activity-detail.tsx`**

Ahora lo pinta el tablero en el rail. Borrar de `activity-detail.tsx` el bloque (líneas 485-491):

```tsx
      {activity.kind === "list_challenge" && (
        <LinkedActivities
          activity={activity}
          isCurator={isCreator || isModerator}
          clubSlug={clubSlug}
        />
      )}
```

y su `import { LinkedActivities } …`.

- [ ] **Step 4: Pasar `clubSlug` al DetailExtension**

`ListChallengeBoard` ahora necesita `clubSlug`, que los otros tres no usan. Añadirlo al contrato en `src/lib/clubs/activities/kinds/types.ts`, dentro de las props de `DetailExtension`:

```ts
    clubSlug: string;
```

Y pasarlo en `activity-detail.tsx`, en el `<DetailExtension …>`:

```tsx
          clubSlug={clubSlug}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: errores solo en los tres tableros restantes (falta la prop `Layout`).

- [ ] **Step 6: Verificar a ojo**

Abrir un reto de lista del que seas participante.
- A 1280: «Tu avance» arriba a la derecha, rejilla ancha (8 columnas) a la izquierda, clasificación y actividades conectadas debajo en el rail.
- A 390: **actualización (revisión final de rama):** el orden real no quedó idéntico al de
  antes — la clasificación pasó de ir justo tras la rejilla a ir después de la matriz y la
  regla. Orden real y aceptado: Tu avance → rejilla → matriz → regla → clasificación →
  conectadas.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubs/list-challenge/list-challenge-board.tsx src/components/clubs/activity-detail.tsx src/lib/clubs/activities/kinds/types.ts
git commit -m "feat(club): el reto de lista reparte avance y clasificación al rail"
```

---

## Task 5: El próximo hito (función pura + test)

Única lógica nueva del plan, y la única testeable con vitest.

**Files:**
- Create: `src/lib/clubs/activities/next-checkpoint.ts`
- Create: `src/lib/clubs/activities/next-checkpoint.test.ts`

**Interfaces:**
- Produces: `nextCheckpoint(checkpoints)` → el primer checkpoint cuyo `status` no es `"confirmed"`, o `null` si están todos confirmados o la lista está vacía.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/clubs/activities/next-checkpoint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextCheckpoint } from "./next-checkpoint";

type Cp = Parameters<typeof nextCheckpoint>[0][number];

function cp(label: string, status: Cp["status"]): Cp {
  return { label, status } as Cp;
}

describe("nextCheckpoint", () => {
  it("devuelve el primero no confirmado", () => {
    const result = nextCheckpoint([
      cp("Hito 1", "confirmed"),
      cp("Hito 2", "confirmed"),
      cp("Hito 3", "pending"),
      cp("Hito 4", "pending"),
    ]);
    expect(result?.label).toBe("Hito 3");
  });

  it("devuelve null si todos están confirmados", () => {
    expect(nextCheckpoint([cp("Hito 1", "confirmed")])).toBeNull();
  });

  it("devuelve null con la lista vacía", () => {
    expect(nextCheckpoint([])).toBeNull();
  });

  it("no asume que los confirmados vengan primero", () => {
    const result = nextCheckpoint([
      cp("Hito 1", "pending"),
      cp("Hito 2", "confirmed"),
    ]);
    expect(result?.label).toBe("Hito 1");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `fnm use 22 && npx vitest run src/lib/clubs/activities/next-checkpoint.test.ts`
Expected: FAIL — «Failed to resolve import "./next-checkpoint"».

- [ ] **Step 3: Implementar**

Crear `src/lib/clubs/activities/next-checkpoint.ts`:

```ts
import type { ActivityCheckpointsView } from "./checkpoints";

type Checkpoint = ActivityCheckpointsView["checkpoints"][number];

// El «próximo hito» del rail (mockup PC, frame 1) es el primero que aún no has
// confirmado. Se deriva de la vista que el tablero ya carga: no hay dato nuevo.
// No se asume orden por estado -- se recorre en el orden en que llegan, que es
// el orden del hito.
export function nextCheckpoint(checkpoints: Checkpoint[]): Checkpoint | null {
  return checkpoints.find((c) => c.status !== "confirmed") ?? null;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `fnm use 22 && npx vitest run src/lib/clubs/activities/next-checkpoint.test.ts`
Expected: PASS, 4 tests.

Si el tipo `status` no admite `"pending"`, abrir `src/lib/clubs/activities/checkpoints.ts`, leer el union real de `status` y ajustar el literal del test al valor no-confirmado que exista. No cambiar la implementación: la condición es `!== "confirmed"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/next-checkpoint.ts src/lib/clubs/activities/next-checkpoint.test.ts
git commit -m "feat(club): deriva el próximo hito de una lectura conjunta"
```

---

## Task 6: `buddy_read` usa el rail

**Files:**
- Modify: `src/components/clubs/checkpoints/buddy-read-checkpoints.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `nextCheckpoint` (Task 5), `ActivityLayoutProps` (Task 1).

- [ ] **Step 1: Añadir el texto de la sección**

En `messages/es.json`, dentro de `activity`:

```json
    "nextCheckpoint": "Próximo hito",
```

- [ ] **Step 2: Aceptar `Layout` y repartir**

En `buddy-read-checkpoints.tsx`, ampliar la firma:

```tsx
export function BuddyReadCheckpoints({ activity, Layout }: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
  clubSlug: string;
  Layout: ComponentType<ActivityLayoutProps>;
  railExtra: ReactNode;
}) {
```

Imports nuevos:

```tsx
import type { ComponentType, ReactNode } from "react";
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
import { nextCheckpoint } from "@/lib/clubs/activities/next-checkpoint";
```

Sustituir el `return` (líneas 52-91) por:

```tsx
  const upcoming = nextCheckpoint(view.checkpoints);

  return (
    <Layout
      railExtra={railExtra}
      railTop={
        activity.viewerIsParticipant && item && total > 0 ? (
          <div className="flex flex-col gap-3">
            {/* Sin encabezado propio: «Hitos» titula el tablero (body) y la
                tarjeta ya dice «Tu progreso». Repetir el h2 aquí lo duplicaría
                en móvil, donde las dos ranuras quedan seguidas. */}
            <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card">
              {item.itemCoverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                <img
                  src={item.itemCoverUrl}
                  alt=""
                  className="h-[66px] w-[44px] shrink-0 rounded-[5px] object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="font-serif text-sm font-semibold text-foreground">
                  {t("yourProgress")}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {positionLabel ? `${positionLabel} · ` : ""}
                  {confirmedCount > 0
                    ? t("yourProgressCheckpoints", { current: confirmedCount, total })
                    : t("yourProgressNone")}
                </p>
                <div className="mt-2 h-[5px] w-[150px] overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((confirmedCount / total) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : undefined
      }
      body={
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("checkpoints")}
          </h2>
          <CheckpointList
            itemType={view.itemType}
            checkpoints={view.checkpoints}
            groupSafeOrder={view.groupSafeOrder}
            onChanged={refresh}
          />
        </div>
      }
      railBottom={
        upcoming ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("nextCheckpoint")}
            </h3>
            <div className="rounded-card border border-border bg-surface p-3 shadow-card">
              <p className="text-[12.5px] font-semibold text-foreground">{upcoming.label}</p>
            </div>
          </div>
        ) : undefined
      }
    />
  );
```

Si `upcoming.label` no existe como campo, usar el nombre real que tenga el checkpoint en `ActivityCheckpointsView` (consultar `src/lib/clubs/activities/checkpoints.ts`) y ajustar también el test de Task 5.

- [ ] **Step 3: Verificar tipos y test**

Run: `npx tsc --noEmit`
Expected: errores solo en tierlist y criteria.

Run: `fnm use 22 && npm test`
Expected: toda la suite unitaria en verde.

- [ ] **Step 4: Verificar a ojo**

Abrir una lectura conjunta con hitos.
- A 1280: «Tu progreso» arriba a la derecha, hitos con sus chats a la izquierda, «Próximo hito» debajo en el rail.
- A 390: **actualización (revisión final de rama):** el orden real no quedó "como antes" —
  antes el `<h2>` «Hitos» precedía a la tarjeta; ahora la tarjeta «Tu progreso» va primero.
  Orden real y aceptado: Tu progreso → Hitos → Próximo hito. Sin encabezado «Hitos»
  repetido (aplicar la nota del paso 2 si aparece).

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/checkpoints/buddy-read-checkpoints.tsx messages/es.json
git commit -m "feat(club): la lectura conjunta lleva progreso y próximo hito al rail"
```

---

## Task 7: `tierlist` y `criteria_challenge` usan el rail

Se agrupan porque cada uno es un movimiento pequeño y ninguno introduce lógica nueva.

**Files:**
- Modify: `src/components/clubs/tierlist/tierlist-board.tsx`
- Modify: `src/components/clubs/criteria-challenge/criteria-challenge-board.tsx`

- [ ] **Step 1: Tierlist — aceptar `Layout` y repartir**

En `tierlist-board.tsx`, ampliar la firma igual que en las tareas anteriores: imports de `ComponentType`/`ReactNode` y `ActivityLayoutProps`, más `clubSlug: string` (aunque no se use) y `railExtra: ReactNode`. La llamada a `<Layout>` debe reenviar `railExtra={railExtra}`.

Sustituir el `return` (líneas 142-244) por un `<Layout>` con este reparto:

- `railTop`: el conmutador de participantes (el `<div className="flex flex-wrap gap-2">` con los botones de cada board) **y** el `<h2>` de «Tu tierlist / La de X».
- `body`: el `<DndContext>` completo (tiers + pool) y el selector táctil de tiers.
- `railBottom`: nada (`undefined`).

El JSX interior de cada pieza se copia **tal cual** está hoy; lo único que cambia es en qué ranura vive. No se toca `move`, ni `handleDragEnd`, ni los sensores: el estado sigue en un solo componente.

- [ ] **Step 2: Criteria — aceptar `Layout` y repartir**

En `criteria-challenge-board.tsx`, misma ampliación de firma, y la llamada a `<Layout>` reenvía igualmente `railExtra={railExtra}`.

Sustituir el `return` (líneas 83-144) por un `<Layout>` con este reparto:

- `railTop`: el `<h2>` de `criteriaProgress`, el chip de modo y la tarjeta del `ProgressRing` con su headline y subline.
- `body`: el `<h3>` de `criteriaWhoContributes`/`criteriaRanking` y la lista de `MemberRankRow`. El ranking se queda en el cuerpo — así lo pone el frame 4 del mockup PC, a diferencia del reto de lista.
- `railBottom`: el `<p>` de `criteriaRule`.

De nuevo, el JSX se copia tal cual; solo cambia la ranura.

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit`
Expected: **sin errores**. Aquí se cierra el andamio que abrió Task 1.

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Verificar a ojo los dos tipos**

- Tierlist a 1280: conmutador arriba a la derecha; filas S–D ocupando el ancho; pool debajo. Arrastrar un ítem sigue funcionando y persiste al recargar.
- Tierlist a 390: conmutador → tiers → pool → selector, como antes. El camino táctil (tocar portada + pulsar tier) sigue funcionando.
- Reto genérico a 1280: anillo arriba a la derecha, «quién aporta» a la izquierda, reglas debajo en el rail.
- Reto genérico a 390: anillo → quién aporta → regla, como antes.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/tierlist/tierlist-board.tsx src/components/clubs/criteria-challenge/criteria-challenge-board.tsx
git commit -m "feat(club): tierlist y reto genérico reparten sus piezas al rail"
```

---

## Task 8: E2E — el shell, el rail y la ausencia de duplicados

**Files:**
- Create: `e2e/club-actividad-pc.spec.ts`

- [ ] **Step 1: Escribir el spec**

Crear `e2e/club-actividad-pc.spec.ts`. Reutiliza la siembra de `club-activity-changes.spec.ts` (cópiala: los helpers no están extraídos a un módulo compartido y este plan no los extrae).

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// La vista de actividad dentro del shell del club (spec 2026-07-21). Lo que se
// protege aquí NO es la estética: es que el responsive no se resolviera
// duplicando controles. La suite corre a 1280 = lg, así que un `hidden lg:block`
// mal puesto deja DOS botones «Salir» en el DOM y `getByRole` revienta por
// strict mode -- exactamente lo que este test detecta.

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function devtestId(): Promise<string> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
      { headers: adminHeaders() },
    )
  ).json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function anyBook(): Promise<string> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/books?select=id&limit=1`, { headers: adminHeaders() })
  ).json()) as { id: string }[];
  if (!rows[0]) throw new Error("no hay libros en catálogo para el e2e");
  return rows[0].id;
}

test("la actividad vive en el shell del club y no duplica controles", async ({ page }) => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-pc-${ts}`;
  const owner = await devtestId();
  const bookId = await anyBook();

  let clubId: string | null = null;
  let activityId: string | null = null;

  try {
    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({ slug, name: "Shell PC E2E", visibility: "private", owner_id: owner }),
      })
    ).json()) as { id: string }[];
    clubId = club.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ club_id: clubId, user_id: owner, role: "owner", status: "active" }),
    });

    const [activity] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          club_id: clubId,
          kind: "list_challenge",
          title: `shell pc ${ts}`,
          status: "active",
          created_by: owner,
        }),
      })
    ).json()) as { id: string }[];
    activityId = activity.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({
        activity_id: activityId,
        item_type: "book",
        item_id: bookId,
        added_by: owner,
        position: 0,
      }),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ activity_id: activityId, user_id: owner }),
    });

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${slug}/actividad/${activityId}`);

    // 1. El sidebar del club está presente, con «Actividades» como sección activa.
    const sidebarActividades = page.getByRole("link", { name: "Actividades" });
    await expect(sidebarActividades.first()).toBeVisible();

    // 2. Un solo control por acción. `getByRole` es strict: si hubiera dos
    //    «Modificar» (uno para móvil y otro para PC), esta línea falla sola.
    await expect(page.getByRole("button", { name: "Modificar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Finalizar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Archivar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Salir" })).toHaveCount(1);

    // 3. El rail trae la clasificación, y sigue habiendo un solo encabezado.
    await expect(
      page.getByRole("heading", { name: "Clasificación del club" }),
    ).toHaveCount(1);

    // 4. En móvil el orden se conserva y tampoco hay duplicados.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Modificar" })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Clasificación del club" }),
    ).toHaveCount(1);

    console.log("ACTIVIDAD PC OK:", slug);
  } finally {
    if (activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
```

Si el nombre exacto del encabezado de clasificación no es «Clasificación del club», mirar el valor real de `listChallengeRanking` en `messages/es.json` y usarlo.

- [ ] **Step 2: Ejecutar el spec nuevo**

Run: `npm run test:e2e -- club-actividad-pc.spec.ts`
Expected: 1 passed.

- [ ] **Step 3: Ejecutar el canario que no debe romperse**

Run: `npm run test:e2e -- club-activity-changes.spec.ts`
Expected: 1 passed, sin haber tocado el fichero.

- [ ] **Step 4: Ejecutar el resto de e2e de club**

Run: `npm run test:e2e -- club-reactivity.spec.ts activity-interconnection-buddy.spec.ts activity-interconnection-tierlist.spec.ts propose-wizard.spec.ts`
Expected: todos en verde. Si cae media suite, mirar la carga de la máquina antes que el código (`docs/TRAMPAS.md`).

- [ ] **Step 5: Commit**

```bash
git add e2e/club-actividad-pc.spec.ts
git commit -m "test(e2e): la actividad en el shell del club sin duplicar controles"
```

---

## Task 9: Cerrar — issues de las discrepancias y sincronizar la doc

Sin esto el cambio no está «hecho» según `AGENTS.md`.

- [ ] **Step 1: Abrir las tres issues de mockup vs. decisión tomada**

Una issue por pieza. Cada una debe decir: qué dibuja el mockup, qué decidió el código, dónde está escrita esa decisión, y por qué NO se implementó.

```bash
gh issue create --title "El mockup PC de tierlist dibuja un «Consenso del club» que el código descartó" --body "$(cat <<'EOF'
`Biblioshare_mockups/Paper - Actividades PC.html` (frame 3) pinta una tarjeta
«Consenso del club» en el rail de la tierlist, con el tier medio de cada título.

**No se implementó, y es deliberado.** `src/lib/clubs/activities/tierlist.ts:19`:

> Sin consenso del club (decisión de diseño): promediar los tiers aplanaría justo
> el desacuerdo, que es el punto de una tierlist.

Se registra para que nadie lo reimplemente leyendo solo el mockup. Si algún día
se quiere una vista agregada, tendría que ser algo que PRESERVE el desacuerdo
(dispersión, tiers más votados con su reparto), no una media.

Detectado al homogeneizar la vista de actividad en PC — spec
`docs/superpowers/specs/2026-07-21-actividad-club-pc-design.md`.
EOF
)"
```

```bash
gh issue create --title "El mockup PC de tierlist dibuja «Compartir al feed» / «Ya compartieron», que no existen" --body "$(cat <<'EOF'
`Paper - Actividades PC.html` (frame 3) pinta en el rail un botón «Compartir la
mía al feed» y un bloque «Ya compartieron · 24».

**La tierlist no tiene concepto de compartir.** `tierlist-board.tsx:145` ya pinta
un conmutador con la tierlist de cada participante, visible para todos ellos: no
hay un paso de publicación que dé sentido a «ya compartieron».

Queda por decidir cuál de las dos formas se quiere:
- (a) el modelo actual — todas visibles entre participantes, sin publicar;
- (b) el del mockup — privada hasta que la compartes, y entonces al feed del club.

(b) exigiría una columna de estado en `club_activity_placements` o una tabla de
publicación, y tocaría la RLS. No se hace de refilón.

Detectado al homogeneizar la vista de actividad en PC — spec
`docs/superpowers/specs/2026-07-21-actividad-club-pc-design.md`.
EOF
)"
```

```bash
gh issue create --title "El mockup PC del reto genérico dibuja «+ Registrar uno», que contradice el modelo de progreso" --body "$(cat <<'EOF'
`Paper - Actividades PC.html` (frame 4) pinta en el rail una tarjeta «Aporta tu
avance» con un botón «+ Registrar uno».

**No se implementó, y es deliberado.** `criteria-challenge-board.tsx:15`:

> Sin botón de "marcar": el progreso sale de los pases de diario, no hay nada que
> pulsar aquí.

El progreso de un reto genérico es DERIVADO de los pases que registras en tu
diario. Un botón de registro directo abriría una segunda fuente de verdad para el
mismo número.

Si se quiere el atajo, la forma coherente sería que ese botón abra el registro de
un pase (el flujo que ya existe), no que sume a un contador propio del reto.

Misma familia que el `modeseg` conmutador del mockup, que ya se pinta como chip
estático por ser config congelada (`criteria-challenge-board.tsx:17-19`).

Detectado al homogeneizar la vista de actividad en PC — spec
`docs/superpowers/specs/2026-07-21-actividad-club-pc-design.md`.
EOF
)"
```

- [ ] **Step 2: Anotar la decisión de forma**

Añadir **al final** de `docs/requirements/decisiones.md` (append-only, no reescribir entradas anteriores) una entrada con la fecha de hoy que registre: la vista de actividad entra en `ClubShell`; el responsive se resuelve con un layout de tres ranuras y un solo DOM, no duplicando por breakpoint; y el motivo (los locators de la suite, que corre a 1280).

- [ ] **Step 3: Backlog**

Revisar `docs/requirements/backlog.md`: si hay una casilla de fidelidad/rediseño de clubes en PC que este trabajo cierre, marcarla. Si no la hay, no inventar una.

**No** hace falta tocar `docs/requirements/data-model.md`: este cambio no toca esquema.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: registra la forma de la vista de actividad en PC"
```

- [ ] **Step 5: Abrir la PR en draft**

```bash
git push -u origin worktree-club-actividad-pc
gh pr create --draft --title "Vista de actividad de club en PC: shell + rail de tres ranuras" --body "..."
```

El cuerpo debe enlazar la spec, resumir las tres decisiones, y enlazar las tres issues del paso 1.

---

## Self-review

**Cobertura de la spec:**

| Sección de la spec | Tarea |
|---|---|
| Decisión 1 — entra en `ClubShell`, cabecera única sticky | Task 2 |
| Decisión 2 — tres ranuras, un solo DOM | Task 1 |
| Decisión 3 — el tablero no se parte (render prop) | Tasks 1, 3 |
| Reparto `buddy_read` | Tasks 5, 6 |
| Reparto `list_challenge` | Task 4 |
| Reparto `tierlist` | Task 7 |
| Reparto `criteria_challenge` | Task 7 |
| «Próximo hito» derivado, sin dato nuevo | Task 5 |
| Las 3 discrepancias mockup/código → issues | Task 9 |
| El e2e existente sigue pasando | Task 8, paso 3 |
| Orden móvil (idéntico en tierlist/criteria_challenge; cambio aceptado en list_challenge/buddy_read, ver spec) | Verificación a ojo en Tasks 4, 6, 7 + Task 8 paso 4 |
| Sin migraciones | — (nada que hacer) |

**Riesgo conocido y aceptado:** el reparto de `tierlist` y `criteria_challenge` (Task 7) se describe por ranuras en vez de con el JSX completo, porque es mover bloques existentes sin tocarlos. Es la única desviación de «código completo en cada paso» del plan, y se compensa con el `tsc --noEmit` sin errores como criterio de cierre.

**Consistencia de nombres verificada:** `ActivityLayoutProps` (Task 1) es el tipo que consumen Tasks 3, 4, 6 y 7. `nextCheckpoint` (Task 5) es el nombre que usa Task 6. `railTop`/`body`/`railBottom`/`railExtra` son las mismas cuatro ranuras en todas las tareas.
