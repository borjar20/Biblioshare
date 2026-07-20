# Notas de reconciliación — resincronización documental (2026-07-20)

> Documento **temporal** de cierre de la resincronización. Recoge lo que las fuentes se
> contradecían. Una vez decidas los puntos abiertos, esto se puede borrar (o archivar).

## A. Ya resueltas contra prod (sin acción tuya)

Contradicciones entre el monolito y las fuentes viejas que **verifiqué contra la base de datos
real** y dejé corregidas en `backlog.md`:

- **§7.10 retos anuales**: el monolito tenía la casilla `[ ]`, pero la tabla `challenges`
  existe en prod → **hecho**.
- **Seguidores + feed** (§7.15 lo daba pendiente, EPIC-05 lo daba hecho): la tabla `follows`
  existe en prod → **hecho** (Bloques A y C).
- **§7.28 sorteo "sacar un lomo"**: contradictorio entre fuentes; tiene spec y e2e → **hecho**.
- **§7.37/7.38/7.39** decían "prod pendiente": verificado que **sí** están en prod (existen
  `book_editions`, `movie_versions`, `passes`, `hydrate_book`) → el backlog los da por hechos
  sin ese caveat.
  - *Matiz*: las entradas **fechadas** de `decisiones.md` conservan a propósito el "prod
    pendiente" — son historia del 14-jul, y un log append-only no se reescribe. Es correcto.

## B. Requieren tu decisión: 3 decisiones del 2026-07-10 perdidas del monolito

El viejo `architecture-decisions.md` tenía tres filas fechadas el 2026-07-10 que **no llegaron
a `REQUIREMENTS.md` §9** (y por tanto no están en `decisiones.md`). Con mi verificación al lado:

1. **Endurecimiento RLS del catálogo** (quitar el `UPDATE` abierto al rol público en
   `movies`/`series`, acotar con grants de columna, `collaborator+` para editar `sagas`/borrar
   `saga_items`, FK compuesto `(library_entry_id, user_id)` en `diary_entries`/`progress_sessions`).
   → **Real y coherente con §8-H.** Hoy está solo como nota al pie de `decisiones.md`.

2. **Separar entornos dev/producción** (dos proyectos Supabase) **+ reemplazar `xlsx` por
   `exceljs`** en el importador de Bookmory.
   → **Verificado real**: existen los proyectos `biblioshare` y `biblioshare-dev`, y
   `package.json` usa `exceljs@^4.4.0` (lo importa `parse-bookmory.ts`). Además **corrige un
   error del monolito**: §7.7 aún decía "dependencia `xlsx`".

3. **Segregar objetivos/retos por tipo de ítem + colas múltiples nombradas.**
   → **Parcial**: las colas múltiples son reales (tabla `queues`). Pero "objetivos por tipo"
   **choca** con que las metas anuales se **fusionaron** después en `challenges` (2026-07-17) y
   hoy el objetivo diario es global. Parece una decisión temprana **revertida** — conviene
   confirmarla antes de registrarla como historia.

**Mi recomendación**: incorporar (1) y (2) al log de `decisiones.md` (son reales y (2) además
corrige el monolito); dejar (3) fuera o reformulada solo como "colas múltiples".

## C. Bug de origen (ya neutralizado)

`REQUIREMENTS.md` §8-B tenía el párrafo de "normalización de géneros" **duplicado** (copia-pega,
dos veces casi idénticas). En `decisiones.md` quedó consolidado en una sola entrada. Como el
monolito pasa a ser un stub, el duplicado desaparece solo.

## D. Deuda de despliegue (no documental, pero anotada aquí para no perderla)

La migración `20260716_list_challenge_completion_mode.sql` está en prod **por efecto** pero
**sin registrar en el ledger**, y su fichero local es más viejo que el renombrado a `passes`
(referencia `diary_entries`, que ya no existe). Si despliegas con `supabase db push`, esa
migración **reventaría**. Pendiente de resolver junto con tu proceso de despliegue.
