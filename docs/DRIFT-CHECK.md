# Chequeo de deriva documental — procedimiento

> **[Procedimiento · a demanda]** No corre solo. Se lanza cuando quieras verificar que los
> docs canónicos siguen coincidiendo con la realidad (prod + repo). Última ejecución: —

El objetivo es detectar **antes de que muerda** el patrón "la doc dice X, el proyecto es Y".
Compara cuatro superficies y reporta solo lo que **no cuadra**.

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

### 3. Arquitectura — `ARQUITECTURA.md` ↔ repo
- Conteos de la cabecera (nº de ficheros TS/TSX, rutas, migraciones, tests) contra el repo real.
- Que las rutas del mapa existan en `src/app/`.

### 4. Backlog — `backlog.md` ↔ evidencia
- Cada ítem marcado `[x]` debería tener evidencia: una spec en `docs/superpowers/specs/`, o
  el objeto en BD, o el fichero en `src/`.
- Ítems `[ ]` que en realidad ya existen en el código (falsos pendientes).

## Salida
Un informe corto por superficie: "coincide" o la lista de divergencias concretas, con la
acción sugerida (actualizar doc / anexar migración / marcar checkbox). No modifica nada solo.

## Cómo pedirlo
Basta con: *"corre el chequeo de deriva"*. Se ejecutan las cuatro comparaciones contra el
proyecto de prod y el repo conectado, y se actualiza la fecha de "Última ejecución" de arriba.
