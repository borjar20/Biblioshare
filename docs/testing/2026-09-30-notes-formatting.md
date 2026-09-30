# Formato de notas — #822 — 2026-09-30

> **[Evidencia de ejecución · verificada contra Chromium y biblioshare-dev el 2026-09-30]**

Las tarjetas de notas y citas del Cuaderno, y las tarjetas de Memorizar, usan
`white-space: pre-line` y permiten partir cadenas largas. Conservan los párrafos
escritos sin permitir que una URL larga ensanche la tarjeta.

La prueba inició sesión con la cuenta persistente `codex_qa` y creó por UI un
único pase temporal sobre una obra ya existente del catálogo de desarrollo.
Sobre ese pase guardó una nota privada con dos párrafos separados por una línea
en blanco y una URL larga. En las dos vistas se comprobaron los saltos dobles
en el texto, el estilo calculado y `scrollWidth <= clientWidth`: **PASS**.
También se inspeccionaron las capturas de ambas vistas. ESLint de las dos
tarjetas y comprobación del diff: **PASS**.

El spec completo terminó en **FAIL** por errores de consola de Next sobre
`Date.now()` durante el prerender de `/buscar` y `/libro/[id]`. Es el síntoma ya
rastreado en #895; no se filtró ni se presenta el recorrido completo como verde.
Las aserciones de formato y de limpieza sí pasaron. Las dos sondas previas
fallaron por medir un rango parcial de texto y por esperar un compositor vacío
que se desmonta al guardar; no demostraban un fallo de formato.

La limpieza borró exclusivamente la nota marcada y el pase creado para la
prueba. Tras recargar, la nota ya no aparecía y la obra no estaba en la colección.
Se conservaron el catálogo, el perfil y la cuenta persistente. Capturas, trazas
y errores de consola quedan en `.scratch/ticket-campaign/qa822*` y
`.scratch/ticket-campaign/test-results/qa822/`.
