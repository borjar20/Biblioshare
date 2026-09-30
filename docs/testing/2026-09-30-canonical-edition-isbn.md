# Identidad canónica de las ediciones — #906

> **[Evidencia de ejecución · local, dev y prod verificados el 2026-09-30]**

El selector compara ISBN-10/13 válidos en una misma forma. La protección de
base de datos cubre RPC e INSERT directo, cambios de ISBN/libro y DELETE,
sin reescribir ediciones previas. La fusión de libros respeta esa identidad y
aborta si tendría que eliminar una edición usada por un pase.

## Fallos conservados y correcciones

- Con la guarda desactivada, dos formas de la misma tirada se admitían como
  filas distintas. Reproducción transaccional: `906-admission-red.log`.
- Las cuatro carreras iniciales pasaban, pero DELETE CASCADE fallaba cuando
  la FK borraba primero la clave privada: `906-concurrency-red.json`. Ahora
  ese orden se permite solo si el padre ya no existe.
- SQL y JavaScript discrepaban en BOM/U+0085 al recortar el ISBN. El helper
  usa el conjunto explícito de ECMAScript: `906-ecmascript-trim-red.log`.
- El gate histórico #920 exigía NULL en el segundo registro. El contrato
  deliberado de #906 devuelve el UUID existente; su regresión exige ese mismo
  UUID y una sola fila. El primer FAIL está en `906-full-db-gate.log`.

Los artefactos citados viven en `.scratch/ticket-campaign/`, excluido de Git.

## Comprobaciones

`node --test scripts/db/bootstrap.test.mjs`: 7 PASS. Replay desde base vacía
con Supabase CLI 2.116.0: 268 pasos. `node scripts/db/verify.mjs`: PASS de
contratos/grants, 37 checks nuevos de admisión, fusión ISBN-10/13 entre obras,
bloqueo antes de escribir por referencia de pase y duplicados históricos.
El runner añadido enfrenta escritores ISBN-10/13 reales: RPC/RPC e
RPC/INSERT en READ COMMITTED y REPEATABLE READ, más cascada; 5 PASS y limpieza
de obras, ediciones, claves y usuario PASS. Se ejecuta en el gate habitual.

Tests de ISBN, candidatas, OpenLibrary y picker: 4 archivos, 58 PASS; ESLint/TypeScript y
validación del mapa: PASS. Estos tests de interfaz son de componente/datos,
no una elección en vivo de OpenLibrary en un navegador autenticado.

En dev se aplicaron ambas migraciones y se ejecutó el SQL transaccional con
rollback. En prod solo se aplicó la protección/redefinición de funciones y se
leyeron objetos, conteos y ACL; no se insertaron fixtures ni se ejecutó una
fusión. Resultado independiente tras aplicar:

| Entorno | Ediciones existentes | ISBN válidos | Grupos históricos | Diferencias ledger/filas | Columnas privadas accesibles por anon/authenticated |
| --- | ---: | ---: | ---: | ---: | ---: |
| dev | 481 | 477 | 15 | 0 | 0 |
| prod | 396 | 394 | 3 | 0 | 0 |

RPC verificada y fusión: solo service_role. RPC manual: authenticated con el
guard de colaborador/admin. Firmas y ACL conservadas. La comprobación de
columnas (superficie 6) dio cero accesos de cliente a las tres columnas de la
tabla privada; no se añadieron columnas a tablas públicas.

## Límite conocido

Las parejas previas permanecen: #1242 contiene el inventario agregado y el
procedimiento para preparar una reconciliación sin perder referencias. El
ejemplo `843392042X` del ticket era inválido; los tests usan la pareja válida
`8433920421`/`9788433920423`, además de un ISBN-10 válido terminado en X.
