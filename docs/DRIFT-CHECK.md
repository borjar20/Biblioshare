# Chequeo de deriva documental — procedimiento

> **[Procedimiento · a demanda]** No corre solo. Se lanza cuando quieras verificar que los
> docs canónicos siguen coincidiendo con la realidad (prod + dev + repo). Última ejecución:
> 2026-07-21 (superficie 5, entornos: dev y prod quedan idénticos — issues #118, #121, #122)

El objetivo es detectar **antes de que muerda** el patrón "la doc dice X, el proyecto es Y".
Compara cinco superficies y reporta solo lo que **no cuadra**.

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

## Salida
Un informe corto por superficie: "coincide" o la lista de divergencias concretas, con la
acción sugerida (actualizar doc / anexar migración / marcar checkbox / aplicar al entorno
que va por detrás). No modifica nada solo.

## Cómo pedirlo
Basta con: *"corre el chequeo de deriva"*. Se ejecutan las cinco comparaciones contra los
proyectos de prod y dev y el repo conectado, y se actualiza la fecha de "Última ejecución"
de arriba.
