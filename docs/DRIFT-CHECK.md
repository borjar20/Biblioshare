# Chequeo de deriva documental — procedimiento

> **[Procedimiento · a demanda]** No corre solo. Se lanza cuando quieras verificar que los
> docs canónicos siguen coincidiendo con la realidad (prod + dev + repo). Última ejecución:
> 2026-07-21 (superficie 5, entornos: dev y prod quedan idénticos — issues #118, #121, #122)

El objetivo es detectar **antes de que muerda** el patrón "la doc dice X, el proyecto es Y".
Compara seis superficies y reporta solo lo que **no cuadra**.

## Qué se compara

### 1. Esquema — `data-model.md` ↔ prod
Fuente de verdad: **los objetos reales de prod**, no el ledger ni la doc.

- Tablas y columnas: comparar el listado de `data-model.md` contra `pg_class`/`pg_attribute`
  del proyecto de producción.
- Enums: contra `pg_enum`.
- RLS: que toda tabla tenga `relrowsecurity = true` (invariante que el doc afirma).

Consulta base (tablas + columnas + RLS + nº de políticas):
```sql
select c.relname, c.relrowsecurity,
       (select count(*) from pg_policies p where p.tablename=c.relname) as policies,
       (select json_agg(a.attname order by a.attnum)
          from pg_attribute a
         where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as cols
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
 order by c.relname;
```

### 2. Migraciones — ledger de prod ↔ ficheros locales ↔ objetos reales
⚠️ **Regla de oro**: "no aparece en `list_migrations`" **≠** "no está en prod". Comprobar
contra los **objetos** (`pg_proc`, `pg_class`), no solo el ledger. (Caso conocido:
`20260716_list_challenge_completion_mode.sql` está aplicada pero sin registrar.)

- Listar ficheros de `supabase/migrations/`.
- Listar el ledger de prod (`list_migrations`).
- Para cada fichero sin correspondencia obvia en el ledger, verificar si su **efecto** ya
  existe en prod (buscar la función/tabla/columna que crea) antes de concluir que "falta".

### 3. Arquitectura — `ARQUITECTURA.md` y `architecture/graph.json` ↔ repo
- Conteos de la cabecera (nº de ficheros TS/TSX, rutas, migraciones, tests) contra el repo real.
- Que las rutas del mapa existan en `src/app/`.

El mapa de `docs/architecture/` es **derivado del código**, así que deriva por definición.
Dos comprobaciones, ninguna necesita conexión a Supabase:

```bash
# Integridad interna: aristas y pasos que apuntan a nodos inexistentes,
# capas y `kind` desconocidos, ids duplicados.
node docs/architecture/sync.mjs --check
```

```bash
# Rutas de fichero huérfanas: lo que de verdad se pudre. `sync.mjs` NO puede
# detectarlo — un `steps[].file` que apunta a un fichero borrado valida igual.
node -e "const g=require('./docs/architecture/graph.json'),f=require('fs');
  const p=new Set();
  g.nodes.forEach(n=>(n.files||[]).forEach(x=>p.add(x)));
  g.flows.forEach(fl=>fl.steps.forEach(s=>s.file&&p.add(s.file.split(':')[0])));
  const bad=[...p].filter(x=>!f.existsSync(x));
  console.log('rutas:',p.size,'| inexistentes:',bad.length);
  bad.forEach(x=>console.log('  NO EXISTE:',x))"
```

**Referencia:** el 2026-07-27 daba `rutas: 149 | inexistentes: 0`. Si un barrido futuro
saca alguna, hay que corregir el nodo o el paso y correr `node docs/architecture/sync.mjs`
(sin `--check`) para re-embeber el JSON en `map.html` — el HTML es autocontenido y lleva
una copia, y editar solo uno de los dos los desincroniza **en silencio**: el diagrama sigue
pintando bien, con datos viejos.

Lo que este chequeo **no** ve: que el mapa haya perdido una ruta, un módulo de `src/lib` o
una tabla que sí existen en el código. Eso se detecta al añadirlos, y el disparador está en
`docs/architecture/README.md`.

### 4. Backlog — `backlog.md` ↔ evidencia
- Cada ítem marcado `[x]` debería tener evidencia: una spec en `docs/superpowers/specs/`, o
  el objeto en BD, o el fichero en `src/`.
- Ítems `[ ]` que en realidad ya existen en el código (falsos pendientes).

### 5. Entornos — dev ↔ prod

Que los dos proyectos Supabase tengan **el mismo esquema**. Esta superficie nació de la
issue #118: un trigger (`promote_active_pass_after_delete`) estaba en prod y no en dev, y el
único síntoma era **un e2e que fallaba solo en local** — indistinguible de un test *flaky*.
El barrido posterior (#121) encontró una segunda: una policy con la rama `tierlist` en prod
y sin ella en dev.

La deriva muerde en las **dos** direcciones, y la segunda es la grave:

- **prod por delante de dev** → los e2e fallan en local por algo que en producción funciona.
- **dev por delante de prod** → se despliega código que espera un objeto que producción no
  tiene. Puede tumbar la app.

⚠️ **Hay que NORMALIZAR o el barrido es inservible.** Comparar `md5(prosrc)` en crudo dio
**6 funciones «distintas»** que eran idénticas en lógica: una difería solo en **CRLF vs LF**
(aplicada desde Windows en un entorno y desde otro sitio en el otro) y el resto en
**comentarios**. Ese ruido entierra las diferencias reales. La consulta de abajo quita
comentarios, colapsa espacios y baja a minúsculas.

**Paso 1 — digest por tipo.** Lanzar en dev y en prod y comparar las cinco filas. Si las
cinco coinciden, los esquemas son equivalentes y se acabó:

```sql
with f as (
  select 'func' kind, p.proname as name,
         md5(lower(regexp_replace(regexp_replace(regexp_replace(p.prosrc,'--[^\n\r]*','','g'),'\s+',' ','g'),'^ | $','','g'))) as h
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
), t as (
  select 'trigger', c.relname||'.'||tg.tgname, md5(lower(regexp_replace(pg_get_triggerdef(tg.oid),'\s+',' ','g')))
    from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and not tg.tgisinternal
), col as (
  select 'columns', table_name, md5(string_agg(column_name||':'||data_type||':'||is_nullable, ',' order by column_name))
    from information_schema.columns where table_schema='public' group by table_name
), pol as (
  select 'policy', tablename||'.'||policyname,
         md5(lower(regexp_replace(cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),'\s+',' ','g')))
    from pg_policies where schemaname='public'
), idx as (
  select 'index', indexname, md5(lower(regexp_replace(indexdef,'\s+',' ','g'))) from pg_indexes where schemaname='public'
), todo as (
  select * from f union all select * from t union all select * from col
  union all select * from pol union all select * from idx
)
select kind, count(*) n, md5(string_agg(name||'='||h, ',' order by name)) digest
  from todo group by kind order by kind;
```

**Paso 2 — solo para los tipos que difieran**, cambiar el `select` final por el detalle y
comparar las dos listas a ojo (el objeto que sobra o falta salta enseguida):

```sql
select kind, string_agg(name||'~'||left(h,6), ' ' order by name) from todo group by kind;
```

**Paso 3 — para un objeto concreto que difiera**, sacar su definición en los dos entornos
(`prosrc` para funciones, `qual`/`with_check` de `pg_policies` para políticas) y decidir
**cuál de los dos coincide con `supabase/migrations/`**, que es la fuente de verdad. El que
no coincida es el que hay que poner al día.

**Referencia:** el 2026-07-21, tras aplicar #118, #121 y #122, los dos entornos quedaron con
digests idénticos: `columns` 45, `func` 57, `index` 116, `policy` 124, `trigger` 25. Si un
barrido futuro da otros números, la diferencia es nueva.

**Paso 4 — enums.** El digest de arriba NO los mira (fue el hueco por el que se coló la
#145: se descubrió a mano al desplegar eventos de club, no por el barrido). Se comparan por
**conjunto de etiquetas, no por orden** — a propósito, ver la diferencia conocida de abajo:

```sql
select t.typname, count(*) as n,
       md5(string_agg(e.enumlabel, ',' order by e.enumlabel)) as etiquetas
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public'
 group by t.typname order by t.typname;
```

Si a un enum le falta una etiqueta en un entorno, esta consulta lo caza. Un `add value` que
falte en prod es de los que tumban la app: el código lo escribe y Postgres lo rechaza.

### Diferencias conocidas y aceptadas (dev ↔ prod)

Se listan aquí para que el siguiente barrido no tenga que volver a decidir si una línea es
la de siempre o una nueva. Si aparece algo que NO está en esta lista, es nuevo.

| Objeto | Diferencia | Decidido | Por qué se acepta |
|---|---|---|---|
| `public.notification_type` | Mismas 17 etiquetas, distinto `enumsortorder`: `club_join_request`/`club_join_approved` van en posición 6-7 en dev y 14-15 en prod | 2026-07-29 (#145) | Se añadieron en momentos distintos en cada entorno. El orden de un enum solo importa para `order by` sobre la columna y para `<`/`>`; hoy **ningún** consumidor ordena por `notifications.type` (todo va por `created_at` — comprobado en `src/lib/social/`). Y **no se puede reordenar un enum in situ**: no hay `ALTER TYPE ... SET ORDER`. La única vía es recrear el tipo y hacer `ALTER TABLE ... ALTER COLUMN ... TYPE` con `USING` sobre `notifications` **en producción**, coste que no justifica un problema sin síntoma |

Lo que **invalidaría** esa decisión: que alguien escriba un `order by type` (o un `<`/`>`)
sobre `notifications.type`. Ese día el resultado diferiría entre local y producción de una
forma difícil de sospechar, y tocaría pagar la recreación del tipo.

Reproducir la deriva:

```sql
select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid
 where t.typname = 'notification_type'
 group by t.typname;
```

### 6. Grants por columna ↔ columnas reales (issue #375)

Varias tablas no tienen grant de tabla sino **por columna** (`revoke all` + `grant` fino).
Postgres exige privilegio sobre **toda columna nombrada** en un INSERT/UPDATE, aunque su
valor sea `NULL`. Consecuencia: **añadir una columna sin añadir su grant rompe la escritura
entera de esa tabla**, no solo el campo nuevo — y no lo detecta nada antes de producción
(compila, pasa el typecheck y pasa los unitarios, que no tocan la BD).

Pasó **dos veces en dos días**: `series.episode_runtime_minutes` (hidratación de tamaños
caída entera) y `passes.planned_on` (**«Seguir» → pantalla de error**, toda alta de pase).
El aviso por escrito ya existía en `schema-baseline.sql` y aun así se olvidó dos veces: por
eso el control vive aquí, en un barrido que se ejecuta, y no en otro comentario.

La consulta devuelve **solo las tablas donde no todas las columnas tienen INSERT/UPDATE**.
Una columna nueva sin grant hace aparecer su tabla en la lista (o le cambia los números si
ya estaba). Si sale exactamente la tabla de referencia de abajo, no hay deriva:

```sql
with cols as (
  select c.table_name, c.column_name,
         has_column_privilege('authenticated', ('public.'||c.table_name)::regclass, c.column_name, 'INSERT')::int as ins,
         has_column_privilege('authenticated', ('public.'||c.table_name)::regclass, c.column_name, 'UPDATE')::int as upd
    from information_schema.columns c
   where c.table_schema='public'
     and c.table_name in (select table_name from information_schema.column_privileges
                           where grantee='authenticated' and table_schema='public'
                             and privilege_type in ('INSERT','UPDATE') group by table_name)
)
select table_name, count(*) as cols, sum(ins) as con_insert, sum(upd) as con_update
  from cols group by table_name
 having count(*) <> sum(ins) or count(*) <> sum(upd)
 order by table_name;
```

**Referencia (prod y dev, 2026-08-04 — 48 tablas con grants por columna, 10 con hueco):**

> **Nota del 2026-08-04 (seguimiento de eventos, solo dev por ahora).** `club_activities` ganó
> **8 columnas** (`starts_at`, `ends_at`, `event_timezone`, `location`, `modality`, `online_url`,
> `event_state`, `updated_at`) **con su grant de INSERT/UPDATE**, así que sigue **sin aparecer**
> en esta lista — que es exactamente la señal de que no hay hueco. En dev la consulta devuelve
> las mismas 10 tablas con los mismos números. Si al aplicar en prod apareciera
> `club_activities`, falta uno de esos 8 grants.
>
> `club_event_followers` **no** entra en la lista por otra razón: solo tiene `grant select`
> (se escribe únicamente por RPC `SECURITY DEFINER`), así que no es una tabla con grants de
> escritura por columna y la consulta no la mira.

| tabla | cols | con_insert | con_update | por qué el hueco es intencionado |
|---|---|---|---|---|
| `books` | 14 | 14 | 9 | la hidratación solo reescribe parte de la ficha |
| `content_reports` | 14 | 14 | 2 | solo moderación cambia `reviewed_*` |
| `movies` | 11 | 11 | 7 | ídem `books` |
| `notifications` | 9 | 0 | 9 | las escriben triggers/service role; el usuario solo marca leído |
| `passes` | 17 | 14 | 11 | `id`/`created_at`/`updated_at` generadas; `user_id`/`item_type`/`item_id` inmutables |
| `people` | 12 | 11 | 6 | ídem `books` |
| `progress_sessions` | 9 | 7 | 0 | `id`/`created_at` generadas; la sesión no se edita |
| `series` | 13 | 13 | 9 | ídem `books` |
| `series_episodes` | 10 | 10 | 0 | catálogo de episodios, alta-only |
| `user_blocks` | 3 | 3 | 0 | un bloqueo se crea o se borra, no se edita |

Si aparece una tabla que **no** está en esta lista, o a una de estas le sube `cols` sin
subir el grant correspondiente, eso es el bug: falta el `grant ... (columna_nueva)`.

> `passes.review` tiene INSERT/UPDATE pero **no** SELECT, y es correcto: se lee por la vista
> `pass_reviews` (`src/lib/library/get-library-items.ts:181`). No lo cuenta esta consulta,
> que solo mira escritura.

## Salida
Un informe corto por superficie: "coincide" o la lista de divergencias concretas, con la
acción sugerida (actualizar doc / anexar migración / marcar checkbox / aplicar al entorno
que va por detrás). No modifica nada solo.

## Cómo pedirlo
Basta con: *"corre el chequeo de deriva"*. Se ejecutan las seis comparaciones contra los
proyectos de prod y dev y el repo conectado, y se actualiza la fecha de "Última ejecución"
de arriba.
