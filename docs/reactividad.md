# Convención de reactividad

Dos capas separadas:

1. **Verdad (servidor).** Toda server action mutadora revalida vía los helpers
   de `src/lib/reactivity/revalidate.ts`. Nunca llames a `revalidatePath`
   directo desde una action salvo rutas únicas no reutilizadas (p.ej. /admin).
   Si una mutación afecta a una zona nueva, añade/usa un helper — no dupliques
   rutas por el código.
2. **Sensación (cliente).** `useOptimistic` (vía el hook de Fase 3) para
   microacciones frecuentes; la capa de verdad reconcilia debajo. El optimismo
   va ENCIMA de la revalidación, nunca en su lugar.

## Cómo obtener datos y reflejar cambios

- **Vista no paginada:** deriva de props del servidor — **no** siembres un
  espejo con `useState(initialX)`. Mecanismo: la server action revalida (helpers
  de `revalidate.ts`) → la RSC re-ejecuta → el componente, al derivar de props,
  se actualiza al momento. La doc de esta versión de Next lo garantiza:
  *"Server Functions: Updates the UI immediately (if viewing the affected
  path)."* No hace falta `router.refresh()` ni re-fetch cliente.
- **Vista paginada (feed con "cargar más"):** necesitas estado local para
  acumular páginas. Mantén la **primera página server-authoritative**: resiémbrala
  desde la prop cuando el servidor entrega una nueva (patrón de React "ajustar
  estado al cambiar una prop", **en render** con seguimiento del valor previo, no
  en un efecto — `set-state-in-effect` está prohibido por el linter). Las páginas
  extra se pierden al resembrar: es el trade-off aceptado. Ver `club-feed.tsx`.
- **Subárbol con estado local propio (drag, edición) que no se puede derivar de
  props sin refactor:** reconcílialo repuntando su callback a `router.refresh()`
  **desde un padre que sí deriva de props** (así `router.refresh()` sí se
  refleja). Patrón usado en `activity-detail.tsx` con los tableros por tipo y los
  checkpoints. Coste: un refresco redundante con el `revalidatePath` de la
  action; aceptable a cambio de no reescribir componentes frágiles.
- **Microacción (like, follow, voto, comentario):** `useOptimisticAction`
  (Fase 3) para respuesta instantánea + rollback en error.

## Modelo de caché

El proyecto usa el modelo anterior (sin `cacheComponents`). `revalidatePath` es
el primitivo correcto: lecturas dinámicas, por-usuario, con RLS. No introducir
`revalidateTag`/`use cache`/Cache Components (cachearía datos por-usuario).
