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

- **Vista no paginada:** deriva de props del servidor. Con la revalidación
  correcta, se actualiza sola tras la acción.
- **Vista paginada (feed con "cargar más"):** estado local sembrado del
  servidor; reconcilia la primera página con `router.refresh()`/re-fetch tras
  CADA mutación. No dejes ninguna mutación sin su refresco.
- **Microacción (like, follow, voto, comentario):** `useOptimisticAction`
  (Fase 3) para respuesta instantánea + rollback en error.

## Modelo de caché

El proyecto usa el modelo anterior (sin `cacheComponents`). `revalidatePath` es
el primitivo correcto: lecturas dinámicas, por-usuario, con RLS. No introducir
`revalidateTag`/`use cache`/Cache Components (cachearía datos por-usuario).
