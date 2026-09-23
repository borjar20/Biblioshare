# Posts de hito coherentes con su pase (#1187) y fuentes solo propias (#1188)

> [Histórico · congelado 2026-09-23] Spec de diseño. El estado vivo lo mandan
> `docs/requirements/data-model.md` (§5.1 `posts`) y `docs/requirements/decisiones.md`.
> Continúa `2026-09-22-posts-limpieza-al-borrar-pase-design.md`.

## 1. Problemas

**#1187.** Corregir el estado reescribiendo el **mismo** pase (`planTransition` → `updateActive`)
deja un post de hito que contradice al pase:

| Cambio | Post que queda | Estado del pase |
|---|---|---|
| Terminado → Abandonado | `finished` | abandonado |
| Abandonado → Terminado | `dropped` | terminado |
| Abandonado → Leyendo («continuar») | `dropped` | en curso |
| Leyendo → Pendiente | `started` | pendiente |

Terminado → Leyendo o Pendiente **no** está en la tabla: `archiveAndCreate` deja el pase terminado
intacto en el diario, así que su `finished` sigue siendo cierto (diagnóstico corregido en la
issue). En prod, el 2026-09-23, hay 0 casos vivos.

**#1188.** La política `posts insert own` solo exige `auth.uid() = author_id`. Cualquiera que vea el
id de un pase ajeno (perfil público) puede colgar un post suyo de él. Eso ocupa
`unique(source_kind, source_id, kind)` y el hito del dueño falla en silencio con 23505. Además, el
post plantado sobrevive al borrado del pase. Reproducido en dev el 2026-09-23; en prod hay 0 casos.

## 2. Decisiones

### 2.1 #1187: trigger `after update of status` en `passes`

La regla es la misma que la de 2026-09-22 («un hito es una afirmación sobre su fuente») y se aplica
también cuando la fuente **cambia** a un estado que la desmiente. Función
`private.cleanup_contradicted_posts()` (`security definer`, `search_path = ''`, sin `execute` para
`anon`/`authenticated`) y trigger `passes_cleanup_contradicted_posts`
`after update of status on public.passes for each row when (old.status is distinct from new.status)`:

| Estado nuevo | Posts del pase (mismo autor) que se borran |
|---|---|
| `planned` | `started`, `finished`, `dropped` |
| `in_progress` | `finished`, `dropped` |
| `completed` | `dropped` |
| `dropped` | `finished` |

- `started` se conserva salvo al volver a pendiente: empezar sigue siendo cierto.
- El filtro `author_id = new.user_id` se mantiene por coherencia con `cleanup_source_posts`.
- Orden con el autopost: la transición escribe el pase (salta el trigger) y **después**
  `maybeAutopostMilestone` publica el hito nuevo. En Terminado→Abandonado se borra `finished` y,
  si la preferencia lo pide, nace `dropped`. El índice único no choca porque es otro `kind`.
- Otros caminos que cambian `status` en `passes`: el deshacer de Letterboxd, que restaura estados
  previos, y la importación. En los dos, borrar el hito que contradice el estado restaurado es lo
  coherente.
- Un post retirado por moderación no se borra: `guard_moderated_write` devuelve `null` en un
  DELETE anidado. Es el mismo comportamiento documentado en 2026-09-22.

### 2.2 #1188: comprobar la fuente en `with check`

`alter policy "posts insert own"` con:

```sql
(select auth.uid()) = author_id
and (
  source_id is null
  or (source_kind = 'pass'             and exists (select 1 from public.passes s            where s.id = source_id and s.user_id = author_id))
  or (source_kind = 'progress_session' and exists (select 1 from public.progress_sessions s where s.id = source_id and s.user_id = author_id))
  or (source_kind = 'episode_watch'    and exists (select 1 from public.episode_watches s   where s.id = source_id and s.user_id = author_id))
)
```

- Subconsultas **invoker**, sin función `security definer`: pasan por la RLS de quien inserta, y el
  dueño siempre ve sus propias fuentes. Una función privilegiada serviría de oráculo («¿el pase X es
  de Y?») también para perfiles privados.
- `source_id` con `source_kind` nulo, o con un `kind` sin rama, se rechaza.
- `service_role` (fixtures e2e, trabajos) ignora RLS: no le afecta.
- Caminos de la app que insertan con fuente: `createPost` desde `maybeAutopostMilestone` (pase
  propio recién escrito) y el compartir de `addSession` (sesión propia recién escrita). Los dos
  cumplen la regla.

## 3. Pruebas

`supabase/tests/posts_hitos_coherentes.sql` (patrón `begin; do …; rollback;`), ejecutada en dev:

- Terminado→Abandonado borra `finished` y conserva `started`. Abandonado→Terminado borra
  `dropped`. Abandonado→Leyendo borra `dropped`. Leyendo→Pendiente borra `started`.
- Un UPDATE que no cambia `status` no borra nada.
- B no puede insertar un post con fuente en el pase o la sesión de A (42501). A sí puede con los
  suyos. Un `thought` sin fuente se sigue insertando.

Regresión: `posts.spec.ts` y `supabase/tests/posts_cleanup_source.sql` siguen en verde.

## 4. Documentación y despliegue

`data-model.md` §5.1 y la cabecera de verificación. Entrada al final de `decisiones.md`. Las
migraciones van en `supabase/bootstrap/manifest.json`, con `npm run db:baseline`. Orden: dev,
pruebas y después prod con autorización explícita.
