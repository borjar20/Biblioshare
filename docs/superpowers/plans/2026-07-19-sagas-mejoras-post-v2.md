# Sagas · mejoras post-v2 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuatro mejoras post-Sagas-v2: fix del descuadre móvil de la ficha, borrar saga desde una zona de peligro, des-anidar subsagas desde el panel del editor, y conexiones laterales con aristas flotantes en el grafo.

**Architecture:** Sin migraciones. `deleteSaga` se apoya en las cascadas ya desplegadas (subsagas → raíz por `on delete set null`). Las aristas flotantes son 100% de render (patrón floating-edges de React Flow, lado no persistido); un componente de arista compartido entre viewer y editor.

**Tech Stack:** Next.js 16 (docs en `node_modules/next/dist/docs/`), React Flow `@xyflow/react` v12, Supabase, next-intl MONO-LOCALE.

**Spec:** `docs/superpowers/specs/2026-07-19-sagas-mejoras-post-v2-design.md`

## Global Constraints

- MONO-LOCALE (`messages/es.json`); curación collaborator+ (botón condicional + gate en action).
- Sin migraciones; `saga_edges` NO cambia (el lado de conexión no se persiste).
- Los estilos por `edge_type` (principal/opcional/requisito) del viewer/editor actuales se conservan idénticos con la arista flotante.
- E2E specs de uno en uno; puerto 3000 verificando a quién sirve. Vitest con Node 22 (`fnm use 22.23.1`).

---

### Task 1: fix del descuadre móvil de la ficha de saga

**Files:**
- Modify: `src/components/saga/saga-info.tsx:52-56`

- [ ] **Step 1**: en la cabecera de la sección de títulos, permitir wrap y dejar encoger el bloque de botones. Cambiar:

```tsx
<div className="mb-3 flex items-center justify-between gap-3">
  …
  <div className="flex shrink-0 flex-wrap items-center gap-2">
```

por:

```tsx
{/* flex-wrap en AMBOS niveles: con 3 botones de curación a 390px la fila no
    cabe; sin esto el shrink-0 desbordaba la página entera en horizontal. */}
<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
  …
  <div className="flex flex-wrap items-center gap-2">
```

(quitar el `shrink-0` del contenedor de botones; los `shrink-0` de cada `<Link>` se quedan).

- [ ] **Step 2**: `npx tsc --noEmit` limpio. Verificación visual a 390px en la QA de la Task 5.
- [ ] **Step 3**: Commit `fix(saga): la cabecera de la ficha ya no desborda en móvil con los botones de curación`.

---

### Task 2: borrar saga (zona de peligro)

**Files:**
- Modify: `src/lib/sagas/curation-actions.ts` (action nueva `deleteSaga`)
- Modify: `src/components/saga/saga-meta-editor.tsx` (zona de peligro al final)
- Modify: `messages/es.json` (claves en `saga`)

**Interfaces:**
- Produces: `deleteSaga(sagaId: string): Promise<{ error?: string }>` — redirect a `/sagas` si borra. La consume la Task 5 (e2e limpia residuos vía UI).

- [ ] **Step 1**: action en `curation-actions.ts` (mismo patrón del archivo):

```ts
// Borra la saga entera. La BD hace el resto en cascada (saga_items,
// saga_nodes, saga_edges, saga_follows); las SUBSAGAS no se borran: quedan
// como sagas raíz (parent_saga_id on delete set null). Los ítems de catálogo
// no se tocan. Vale para manuales y TMDB (una TMDB puede reaparecer por
// cache-as-you-go — aceptado en el spec post-v2 §3).
export async function deleteSaga(sagaId: string): Promise<{ error?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  if (!UUID_RE.test(sagaId)) return { error: "generic" };

  const { data: existing } = await supabase
    .from("sagas")
    .select("id")
    .eq("id", sagaId)
    .maybeSingle();
  if (!existing) return { error: "generic" };

  const { error } = await supabase.from("sagas").delete().eq("id", sagaId);
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  redirect("/sagas");
}
```

- [ ] **Step 2**: zona de peligro al final del `return` de `SagaMetaEditor` (tras el bloque Universo), con confirmación en dos pasos en estado local:

```tsx
{/* ── Zona de peligro ── */}
<div className="flex flex-col gap-2 rounded-xl border border-status-dropped/40 p-4">
  <span className="font-mono text-[11px] tracking-[0.12em] text-status-dropped uppercase">
    {t("dangerZone")}
  </span>
  {confirmingDelete ? (
    <>
      <p className="text-xs text-muted-foreground">{t("deleteWarning")}</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={deletePending} onClick={() => setConfirmingDelete(false)}>
          {t("deleteCancel")}
        </Button>
        <button
          type="button"
          disabled={deletePending}
          onClick={handleDelete}
          className="rounded-lg bg-status-dropped px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {deletePending ? t("deleting") : t("deleteConfirm")}
        </button>
      </div>
      {deleteError && <p className="text-sm text-status-dropped">{t("editErrors.generic")}</p>}
    </>
  ) : (
    <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(true)} className="self-start">
      {t("deleteSaga")}
    </Button>
  )}
</div>
```

con hooks junto a los demás:

```tsx
const [confirmingDelete, setConfirmingDelete] = useState(false);
const [deleteError, setDeleteError] = useState(false);
const [deletePending, startDeleteTransition] = useTransition();

function handleDelete() {
  setDeleteError(false);
  startDeleteTransition(async () => {
    try {
      const result = await deleteSaga(sagaId);
      // deleteSaga redirige a /sagas si borra; si devuelve, es error.
      if (result?.error) setDeleteError(true);
    } catch (err) {
      // redirect() de Next lanza NEXT_REDIRECT: dejarlo propagar.
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setDeleteError(true);
    }
  });
}
```

(Si `Button` no acepta `className`, usar un `<button>` pelado con las clases del variant secundario, como haga el archivo en casos análogos. Si `bg-status-dropped` no existe como clase completa en el repo, mirar cómo pinta el rojo `text-status-dropped` existente y usar el token equivalente de fondo.)

- [ ] **Step 3**: i18n, grupo `saga`:

```json
"dangerZone": "Zona de peligro",
"deleteSaga": "Borrar saga",
"deleteWarning": "Se borran sus membresías, su grafo y sus seguidores. Sus subsagas quedarán como sagas sueltas. Los títulos del catálogo no se tocan. Esto no se puede deshacer.",
"deleteCancel": "Cancelar",
"deleteConfirm": "Borrar definitivamente",
"deleting": "Borrando…"
```

- [ ] **Step 4**: `npx tsc --noEmit` limpio; probar en dev server propio (puerto libre) que la zona se pinta. Commit `feat(saga): zona de peligro — borrar saga desde editar ficha`.

---

### Task 3: des-anidar subsagas desde el panel del editor

**Files:**
- Modify: `src/components/saga/editor/editor-left-panel.tsx`
- Modify: `src/components/saga/editor/saga-graph-editor.tsx` (callback + limpieza del borrador)
- Modify: `messages/es.json` (claves en `sagaEditor`)

**Interfaces:**
- Consumes: `setParentSaga(sagaId, null)` de `curation-actions.ts` (existente).

- [ ] **Step 1**: leer ambos archivos. En `saga-graph-editor.tsx` viven el estado `children` (subsagas) y el borrador (`nodes`/`edges`) con `removeNode` ya implementado. Añadir un handler:

```tsx
const unnestChild = useCallback(
  async (childId: string) => {
    const result = await setParentSaga(childId, null);
    if (result.error) return result;
    // Fuera del universo: su nodo del borrador (si existe) se queda huérfano
    // — expansión vacía en el cómputo y grupo fantasma en la ficha (DEFER 4
    // de fase 5). Se quita del borrador en el mismo gesto.
    const orphan = nodes.find((n) => n.childSagaId === childId);
    if (orphan) removeNode(orphan.id);
    setChildren((cur) => cur.filter((c) => c.id !== childId));
    return {};
  },
  [nodes, removeNode],
);
```

(ajustar nombres reales de estado/setters del archivo; si `removeNode` ya borra aristas conectadas — lo hace desde fase 3 — no duplicar nada). Pasarlo al panel como prop `onUnnestChild`.

- [ ] **Step 2**: en `editor-left-panel.tsx`, junto a cada subsaga de la lista (donde ya está la paleta de color), añadir una acción «Sacar del universo» con confirmación inline de dos pasos (mismo patrón de estado local que la zona de peligro de la Task 2: primer tap muestra el aviso corto + Confirmar/Cancelar). El aviso: `sagaEditor.unnestWarning`. Deshabilitar mientras la transición está pendiente; error → texto rojo con la clave genérica del grupo.

- [ ] **Step 3**: i18n, grupo `sagaEditor`:

```json
"unnestChild": "Sacar del universo",
"unnestWarning": "Sus títulos dejarán de contar en este universo y su nodo se quitará del grafo.",
"unnestConfirm": "Sacar",
"unnestCancel": "Cancelar"
```

- [ ] **Step 4**: `npx tsc --noEmit` + `fnm use 22.23.1; npx vitest run src/lib/sagas` verdes. Commit `feat(saga): sacar subsagas del universo desde el panel del editor`.

---

### Task 4: conexiones laterales — aristas flotantes y handles en 4 lados

**Files:**
- Create: `src/components/saga/graph/floating-edge.tsx`
- Modify: `src/components/saga/graph/saga-graph-view.tsx` (edgeTypes + ConnectionMode)
- Modify: `src/components/saga/editor/saga-graph-editor.tsx` (edgeTypes + ConnectionMode)
- Modify: `src/components/saga/graph/graph-nodes.tsx` y `src/components/saga/editor/editor-node.tsx` (handles en 4 lados)

- [ ] **Step 1**: `floating-edge.tsx` — arista flotante autocontenida (patrón floating-edges de React Flow, sin dependencias nuevas):

```tsx
"use client";

import { BaseEdge, getBezierPath, useInternalNode, Position, type EdgeProps } from "@xyflow/react";

// Arista flotante (spec post-v2 §4): se dibuja entre los LADOS más cercanos
// de ambos nodos, ignorando qué handle inició la conexión — el lado no se
// persiste (saga_edges no cambia). Matemática estándar del ejemplo
// floating-edges: intersección de la línea entre centros con el rect del nodo.

type Rect = { x: number; y: number; w: number; h: number };

function nodeRect(node: { internals: { positionAbsolute: { x: number; y: number } }; measured?: { width?: number; height?: number } }): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    w: node.measured?.width ?? 0,
    h: node.measured?.height ?? 0,
  };
}

// Punto del borde del rect `a` en dirección al centro de `b`, y el lado usado.
function edgePoint(a: Rect, b: Rect): { x: number; y: number; position: Position } {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  // ¿Qué borde corta antes la línea entre centros? Comparar pendientes
  // normalizadas al semiancho/semialto.
  if (a.w > 0 && a.h > 0 && Math.abs(dx) / a.w > Math.abs(dy) / a.h) {
    const sign = dx > 0 ? 1 : -1;
    return {
      x: ax + (sign * a.w) / 2,
      y: ay + ((dy * a.w) / 2 / Math.abs(dx || 1)) * 1,
      position: sign > 0 ? Position.Right : Position.Left,
    };
  }
  const sign = dy > 0 ? 1 : -1;
  return {
    x: ax + (sign > 0 ? (dx * a.h) / 2 / Math.abs(dy || 1) : (-dx * a.h) / 2 / Math.abs(dy || 1)) * (sign > 0 ? 1 : -1),
    y: ay + (sign * a.h) / 2,
    position: sign > 0 ? Position.Bottom : Position.Top,
  };
}

export function FloatingEdge({ id, source, target, style, markerEnd, label, labelStyle }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sr = nodeRect(sourceNode);
  const tr = nodeRect(targetNode);
  const s = edgePoint(sr, tr);
  const t = edgePoint(tr, sr);

  const [path, labelX, labelY] = getBezierPath({
    sourceX: s.x,
    sourceY: s.y,
    sourcePosition: s.position,
    targetX: t.x,
    targetY: t.y,
    targetPosition: t.position,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
      label={label}
      labelStyle={labelStyle}
      labelX={labelX}
      labelY={labelY}
    />
  );
}
```

**OJO**: la fórmula de `edgePoint` de arriba es la guía; el implementador DEBE
validarla con nodos reales (la del ejemplo oficial de floating-edges es la
referencia — si difiere, usar la del ejemplo). Si `BaseEdge` de la versión
instalada no acepta `label`/`labelX`, renderizar la etiqueta como hace hoy el
componente de arista existente (mirar cómo pinta etiquetas/estilos el viewer
actual y conservarlo).

- [ ] **Step 2**: registrar `edgeTypes = { floating: FloatingEdge }` en viewer y editor, mapear TODAS las aristas a `type: "floating"` conservando `style`/`markerEnd`/etiquetas por `edge_type` exactamente como estén hoy (buscar dónde se construyen los objetos edge en ambos y tocar solo `type`). Añadir `connectionMode={ConnectionMode.Loose}` al `<ReactFlow>` del EDITOR (el viewer no conecta).

- [ ] **Step 3**: handles en 4 lados. En `editor-node.tsx`, sustituir el par actual (target Top + source Bottom, líneas 35/51) por 4 handles `type="source"` (uno por `Position.Top/Right/Bottom/Left`, cada uno con `id` distinto — p. ej. `"t"/"r"/"b"/"l"`) con la misma clase `HANDLE`; con `ConnectionMode.Loose` un handle source acepta también conexiones entrantes. En el handler `onConnect` del editor, IGNORAR `sourceHandle`/`targetHandle` (no persisten). En `graph-nodes.tsx` (viewer), los nodos necesitan al menos un handle source y uno target INVISIBLES para que las aristas flotantes anclen (la arista flotante calcula su propio punto, pero React Flow exige handles en los nodos): dejar los existentes con `className` invisible (`opacity-0 pointer-events-none`) si no lo están ya.

- [ ] **Step 4**: correr `npx playwright test e2e/sagas-v2-mapa.spec.ts` y `npx playwright test e2e/sagas-v2-editor.spec.ts` (de uno en uno, puerto 3000 verificado). El spec del editor conecta nodos arrastrando desde un handle: si su selector era el handle único, apuntar a un handle concreto por id/clase (`.react-flow__handle` sigue existiendo ×4 — usar `.first()` o el del lado que el test asuma) y verificar que el revert por teclado sigue funcionando. Ajustar solo selectores, no comportamiento.
- [ ] **Step 5**: Commit `feat(saga): aristas flotantes y conexiones desde los 4 lados del nodo`.

---

### Task 5: e2e + QA + REQUIREMENTS + revisión final

- [ ] **Step 1**: extender `e2e/sagas-v2-curacion.spec.ts`: al final del test 1, borrar las sagas creadas (`[QA Curación] Hija` y `[QA Curación] Universo`) vía la zona de peligro nueva (ir a `/saga/<uuid>/editar` → Borrar saga → confirmar → esperar redirect a `/sagas`) — el spec deja de generar residuos (cierra el DEFER 9 del PR #90). Correr `npx playwright test e2e/sagas-v2-curacion.spec.ts` DOS veces en verde y verificar (Management API, lo hace el controller) que no quedan filas `[QA Curación]%`.
- [ ] **Step 2**: correr también `e2e/sagas-v2-biblioteca.spec.ts` una vez (regresión de la ficha/tab tras el fix móvil).
- [ ] **Step 3**: commit `test(saga): el e2e de curación limpia sus sagas vía la zona de peligro`.
- [ ] **Step 4 (controller)**: QA navegador — ficha de saga a 390px SIN scroll horizontal (el descuadre de la captura); des-anidar subsaga desde el panel (con y sin nodo en el grafo); borrar una saga de prueba (confirmación, redirect, subsaga superviviente como raíz); en el editor arrastrar una conexión desde un handle lateral y ver la arista flotante recolocarse al mover nodos; viewer con el mismo dibujo. Restaurar todo al final.
- [ ] **Step 5 (controller)**: REQUIREMENTS vía backlog-scribe.
- [ ] **Step 6 (controller)**: revisión final de rama (fable) con `review-package`, fix wave única si hace falta, push y PR draft.

## Self-Review

- Spec §1→Task 1, §2→Task 3, §3→Task 2 (+e2e en Task 5), §4→Task 4; sin migraciones en ninguna.
- El único código con incertidumbre declarada (fórmula de intersección) lleva la instrucción de validarla contra el ejemplo oficial del patrón y contra nodos reales, con la e2e del editor como red.
- Tipos: `deleteSaga` devuelve `{error?}` y redirige (patrón `createSaga`); `unnestChild` reutiliza `setParentSaga` existente sin cambiarle la firma.
