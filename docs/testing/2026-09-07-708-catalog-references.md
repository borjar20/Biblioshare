# Referencias polimórficas de catálogo (#708)

[Canónico · verificado localmente 2026-09-07; producción no modificada]

La prueba mínima insertaba una nota sintética, borraba su libro y exigía un
rechazo: antes de la migración fallaba con `deleting catalog leaves an orphan
note`. Tras la migración conserva ambos registros y pasa. Las pruebas terminan
con rollback o retiran sus propias filas aleatorias.

## Política

`private.catalog_reference_rules()` es el inventario único de 15 pares de
columnas en 13 tablas. La política procede del contenido que se perdería:

| Tablas | Borrado de catálogo | Motivo |
|---|---|---|
| passes | Bloquear | Fechas, notas y reseñas |
| credits | Cascada | Hechos derivados del proveedor |
| club_activity_items | Bloquear | Selección y orden de participantes |
| club_activity_opinions | Bloquear | Opiniones y puntuaciones |
| club_activity_placements | Bloquear | Clasificación elegida por participantes |
| club_rounds | Bloquear | Conversación y elección de la ronda |
| collection_items | Bloquear | Selección y orden de la colección |
| library_entries | Bloquear | Datos históricos congelados, no descartables |
| notes | Bloquear | Notas y citas del usuario |
| saga_items | Bloquear | Orden, rol, colocación y opcionalidad curados |
| saga_optional_skips | Bloquear | Decisión del usuario |
| saga_placement_windows | Bloquear | Sujeto y ambas anclas curadas |
| saga_route_entries | Bloquear | Itinerario y notas curados |

El guard `private.protect_catalog_references` sustituye los guards separados
de pases y créditos. Mantiene SQLSTATE 23503, con mensaje genérico sin revelar
la tabla privada que bloquea. Para borrar hay que reasignar o retirar las
referencias explícitamente; no cambia la autorización de DELETE de catálogo.

## Concurrencia y alcance

Cada alta o cambio del par referenciador toma KEY SHARE sobre su fila de
catálogo y rechaza destinos inexistentes. Las referencias opcionales vacías
siguen permitidas y las actualizaciones que no cambian el par no revalidan
huérfanos históricos. DELETE toma su bloqueo de fila y comprueba referencias
con una instantánea nueva después de esperar a escritores anteriores.

Este mecanismo exige **READ COMMITTED** para DELETE de catálogo. REPEATABLE READ
y SERIALIZABLE se rechazan expresamente con SQLSTATE 25000: un trigger SQL no
dispone del crosscheck de instantáneas que implementa una FK nativa. Es una
restricción sobre mantenimiento privilegiado, no sobre las lecturas/escrituras
ordinarias de la aplicación. Las dos intercalaciones insert/delete se probaron
con conexiones simultáneas y un solapamiento observado en `pg_stat_activity`.

No hay limpieza de huérfanos previos, columnas nuevas ni cambios de grants de
tablas. No cubre identificadores incrustados en JSON/URL (#546, #875, #879) ni
otras parejas con nombres distintos que no figuren en el inventario; no afirma
una FK universal. Tampoco protege cambios privilegiados del ID de catálogo.

## Comprobaciones

- Supabase local vacío: 238 pasos de bootstrap de esta rama, sin depender de #920.
- `supabase/tests/catalog_reference_guards.sql`: 45 casos de restricción/cascada
  (14 referencias restrictivas y créditos, por cada tipo de catálogo), destino
  inexistente, privilegios de helpers y rechazo de snapshot antiguo.
- `scripts/db/verify-catalog-reference-concurrency.mjs`: ambos órdenes de
  concurrencia; no quedan notas huérfanas ni filas sintéticas.
- `scripts/db/verify.sql`: contrato del esquema.

La migración dev se verifica por objetos reales y permisos. El conector dev
solo permite consultas de lectura, de modo que las pruebas de escritura son
locales. Ningún resultado anterior afirma que se haya cambiado producción.
