# Nueva experiencia: acción compacta en móvil

> **[Informe de verificación · 2026-10-03]** Ajuste local comprobado en navegador contra Next dev. Este corte no acredita todavía publicación del ajuste en producción.

En una cabecera estrecha, la etiqueta completa compartía una fila con el H1, se partía y aumentaba el alto del botón. La corrección vive únicamente en `src/app/experiencias/page.tsx`: por debajo de 640 px, acción circular con icono de añadir y área de 44 × 44 px. El texto existente «Nueva experiencia» permanece como nombre accesible y title. Desde 640 px vuelve a mostrarse la etiqueta y el padding anterior. No cambia el primitivo compartido PageHeader ni los tokens, traducciones, rutas o permisos.

## Verificación

Cuenta persistente de desarrollo, sin crear cuentas ni enviar formularios de Experiencias. Node 22.23.1, Playwright 1.61.1 y Chromium; un único Next 16.3.8 dev en localhost:3000.

| Anchura | Temas | Botón | Resultado |
|---|---|---|---|
| 320 px | Claro / oscuro | 44 × 44 px; icono | PASS |
| 390 px | Claro / oscuro | 44 × 44 px; icono | PASS |
| 640 px | Claro / oscuro | 183,94 × 44 px; etiqueta completa | PASS |
| 1280 px | Claro / oscuro | 183,94 × 44 px; etiqueta completa | PASS |

Ocho combinaciones: H1 en una línea, sin recortes, solapamientos ni desbordamiento horizontal. Nombre accesible y title «Nueva experiencia» preservados; foco de teclado con outline de 2 px. Ocho activaciones abren `/experiencias/nueva` y muestran el formulario, sin enviarlo.

ESLint del archivo cambiado termina con código 0. Las tres pruebas existentes de `buttonVariants` pasan. No se añaden tests permanentes para este ajuste reversible de presentación.

Las observaciones de red se conservan separadas de las medidas visuales: siete GET a la ruta de creación cancelados al cambiar de caso y ocho POST automáticos del shell a `/experiencias`, que requieren distinguir acciones de celebraciones de envíos de formularios. El reporte final del agente QA mantiene esa clasificación; no se afirma ausencia de toda petición POST. No se observaron errores de consola, página ni HTTP 4xx/5xx en el recorrido.

## Evidencia y límites

Artefactos locales fuera del checkout:

```text
C:/Users/borja/.codex/visualizations/2026/10/02/01a0fb75-6319-7093-ab05-7b306c149fb9/experiencias-mobile-button-2026-10-03/
```

`qa-results.json`, runner `verify-mobile-cta.cjs` y capturas `experiencias-320-light.png`, `experiencias-390-dark.png` y `experiencias-1280-light.png`. El navegador se cierra al terminar. La comprobación corresponde a Next dev; los gates de CI y la publicación tienen su propio resultado posterior. No modifica ni borra la cuenta persistente de desarrollo.
