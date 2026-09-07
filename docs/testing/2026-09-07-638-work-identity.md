# Identidad de obras en bibliografías (#638)

[Canónico · verificado 2026-09-07 contra pruebas locales y capturas públicas; producción no verificada]

La primera edición de `search.json` podía renombrar una obra, fusionarla con otra
o descartarla como estuche. La reproducción mínima Everlost/Everwild fallaba
antes del cambio. Los fixtures reales también conservan un renombre incorrecto
de `OL15420142W` a un libro distinto.

La identidad usa títulos de obra equivalentes o redirecciones explícitas de Open
Library. Un título de edición aislado no fusiona obras. Los títulos ingleses solo
sustituyen variantes equivalentes; las traducciones españolas siguen siendo
presentación, salvo contradicción con otra obra presente o título de estuche.

Los conflictos solicitan detalles públicos, hasta cuatro peticiones simultáneas
y cinco segundos adicionales en total. Las redirecciones solo siguen claves de
obra válidas, sin ciclos y con un máximo de cuatro documentos. Se cachean datos
públicos del proveedor durante un día, sin sesión ni consultas sujetas a RLS.

Para estuches, además del filtro existente sobre el propio título de obra, se
acepta la clasificación `book set` de la obra o una página completa de al menos
dos ediciones distintas, vinculadas a esa obra y todas clasificables como
recopilación. Se incluyen las enumeraciones de contenido en subtítulos de
`collection`/`unboxed`. Las páginas parciales no autorizan un descarte.

## Evidencia reproducible

`src/lib/catalog/openlibrary/__fixtures__/work-identity-2026-09-07.json` conserva
las respuestas públicas de detalle y ediciones obtenidas el 7 de septiembre.
Los fixtures de búsqueda originales siguen intactos (13 de agosto).

| Caso | Evidencia | Resultado probado |
|---|---|---|
| Sunrise/Amanecer | Redirección OL45607348W → OL43426400W | Una obra |
| Gregor | Clasificación `book set` de OL24268078W | Estuche filtrado |
| Ultimate Unwind | Tres ediciones, dos con contenido enumerado | Estuche filtrado |
| Unwind Unboxed | Dos ediciones que enumeran el contenido | Estuche filtrado |
| OL15420142W | Título de edición inglesa contradictorio | Título de obra conservado |
| Everlost/Everwild | Edición mal enlazada, sin redirect | Ambas obras conservadas |

La prueba de replay obtiene **14 obras de Collins y 68 de Shusterman**, corrige
el título sobre cigarrillos/alcohol y conserva los tres libros Everlost,
Everwild y Everfound. Sin detalles adicionales, los mismos fixtures conservan
16/70 candidatos: no se oculta esa degradación cambiando los datos de prueba.

Comando dirigido: `node node_modules/vitest/vitest.mjs run src/lib/catalog/openlibrary/normalize.test.ts src/lib/catalog/openlibrary/author-books.test.ts src/lib/catalog/openlibrary/work-identity.test.ts --maxWorkers=1 --no-file-parallelism`.

## Límites que siguen en #638

Si el proveedor falla o aporta información ambigua, se conserva la obra; pueden
aparecer duplicados o recopilaciones sin clasificar. Dos registros editables no
garantizan verdad bibliográfica. La equivalencia de títulos de obra dentro de
un autor sigue siendo una heurística preexistente. Las traducciones españolas
erróneas que no contradigan otra obra presente pueden seguir apareciendo.
El cambio no repara filas ya hidratadas ni escribe en producción. La reparación
histórica y la comprobación del proveedor en condiciones reales permanecen
pendientes en el issue; el replay no mide disponibilidad ni latencia real.
