# #1292 — frontera de endpoints de OpenLibrary

> **[Canónico · verificado contra código, unitarios y comprobaciones estáticas el 2026-10-02; CI/CodeQL y entrega pendientes]**

## Comportamiento y diagnóstico

Las consultas de obras y ediciones aceptan únicamente una identidad `OL` +
dígitos + `W`. Conservan las formas históricas `OL45804W`, `works/OL45804W`,
`/works/OL45804W` y `/OL45804W`. Los ISBN se normalizan y deben superar su
dígito de control. La validación ocurre antes de `fetch`; cada identidad se
codifica con `encodeURIComponent` al incorporarla al segmento de la URL.

También se valida la identidad de obra devuelta por el proveedor en las
consultas ISBN. Una identidad inválida no provoca una segunda petición ni
una consulta a `/works/.json`. Se mantiene el fallback al título de edición.

El diagnóstico está confirmado con las funciones reales anteriores al
cambio: una clave `../search.json?q=proof#` desviaba las cuatro consultas
señaladas por CodeQL a `/search.json?q=proof`. El hostname inicial seguía
siendo `openlibrary.org`. No se ha demostrado acceso a hosts internos,
exfiltración ni una redirección maliciosa. Las alertas 2–5 estaban abiertas
en main desde el 2026-09-13; se detectaron al revisar la CI de #1237 y se
resuelven en este cambio independiente.

## Verificación local

Base `89d82e83749350cc761b4a5bdd1d1188a34ff3cb`. Node 24.19.0,
Vitest 4.1.11. Los recuentos proceden del JSON nativo y de los archivos
realmente ejecutados; los bloques `describe` no se cuentan como archivos.

| Control | Resultado |
|---|---|
| RED preservado | 57 PASS / 16 FAIL / 0 pending, cinco archivos |
| GREEN focal final | 80 PASS / 0 FAIL / 0 pending, cinco archivos |
| Consumidores afectados | 256 PASS / 0 FAIL / 0 pending, dieciséis archivos |
| ESLint focalizado | PASS, exit 0 |
| TypeScript completo | PASS, exit 0 |
| Revisión independiente | PASS, sin hallazgos materiales |
| CI/CodeQL de entrega | Pendiente |

`endpoint-boundaries.test.ts` llama a las funciones exportadas y observa
`fetch`. Prueba traversal, query, fragmento, escapes, barras invertidas,
URLs completas, namespaces incorrectos, saltos de línea, NUL y tipos
incorrectos. Exige tanto el fallback previsto como la ausencia de petición.
Los controles positivos verifican las cuatro formas válidas, ISBN-13,
ISBN-10 con X y normalización de guiones/X minúscula.

Los controles de compatibilidad conservan las cachés de 86400/3600 segundos,
timeouts, paginación de cinco/dos páginas, tolerancia a un fallo parcial de
página y fallback de descripción de edición. El lote afectado incluye
hidratación, búsqueda, candidatas, admisión de edición y créditos de autores.
Las pruebas focales están incluidas en ese lote: no se suman ambos totales.

## Evidencia y límites

Evidencia ignorada de sesión:
`.scratch/ticket-campaign/qa1292/seal-1790927760728/`.

- `evidence-final.json`: SHA256 `b1e8a17dba5e4cb6fc9c0c190b89557eed5804956fd35e3d1a252c23abdbe65e`.
- `evidence-sha256.json`: SHA256 `c764d52d04953d448e885d2cc7cda3e89be747375e708542f62077556a6c4d4d`.
- La revisión independiente verificó 99 huellas sin discrepancias y la
  coincidencia de las cuatro fuentes vivas con los snapshots finales de
  GREEN, lote afectado y comprobaciones estáticas.

El RED y las pasadas intermedias se conservan en rutas propias. El primer
GREEN precedía a la recuperación de la forma histórica `/OL…W`; sólo el
sello anterior acredita la fuente final.

No hay peticiones externas, credenciales, datos, migraciones ni servicios
locales en esta verificación. El spy prueba la frontera de las funciones,
no la disponibilidad de OpenLibrary. Se conserva la política de redirección
ISBN → edición documentada por [OpenLibrary](https://openlibrary.org/dev/docs/api/books).
La defensa valida la URL inicial y las claves devueltas; no garantiza
protección frente a un proveedor comprometido ni a su DNS.

El [análisis de CodeQL](https://codeql.github.com/codeql-query-help/javascript/js-request-forgery/)
contempla traversal del pathname con hostname fijo. El resultado del
analizador desplegado debe confirmarse en CI antes de cerrar #1292. No se
suprimen alertas ni se cambian las reglas del analizador.
