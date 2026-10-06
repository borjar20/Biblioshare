# Entrada de crónicas en Inicio — 2026-10-07

> [Canónico · candidato local/dev verificado el 2026-10-07]

Problema y reproducción: [#1441](https://github.com/borjar20/Biblioshare/issues/1441). Tras ver una crónica, Inicio reducía la tarjeta a un texto gris de 12,5 px sin fecha visible ni acción explícita. También ocurría con periodos tranquilos. Chromium contra el build anterior midió un enlace de 18,75 px de alto en 320 px, claro y oscuro; la entrada de Estadísticas seguía disponible.

La entrada mantiene tarjeta, narradora, periodo y «Ver crónica» en todos los estados. La marca «Nueva» se limita a full sin ver. Usa los estilos editoriales de Inicio y la variante secundaria de botón, dentro de un único enlace; el span de la acción no crea otro control. El enlace y el fallback de Suspense comparten una altura de 104 px. La selección del periodo y la lectura con sesión/RLS no cambian.

## Verificación

- Next 16.3.8 / Node 22.23.1, build de producción PASS; BuildID dwR2gEsxSshLSUoRpTrBH. TypeScript incluido en build PASS.
- 13 unitarios focales PASS. Antes del cambio, los dos nuevos casos (ya vista y tranquila) fallaron por ausencia de acción explícita; los 11 existentes pasaron.
- ESLint de componente, unitarios y E2E PASS sin avisos.
- Cinco E2E de crónicas PASS, 37,0 s, un worker, cero reintentos. Se amplía el recorrido existente: después de abrir/cerrar, periodo y «Ver crónica» siguen visibles y el botón aparente vuelve a abrir el reproductor.
- Revisión estática independiente sin hallazgos: selección, privacidad, semántica, altura reservada y namespace de traducción.

## Navegador real

24 combinaciones PASS en Chromium contra build/start local: nueva/vista/tranquila/anual, 320/390/1440 px, claro/oscuro. La fixture anual declara el corte 25 de diciembre; esta matriz verifica la entrada y su fecha, no revalida las stories anuales.

La tarjeta mide 104 px de alto en todos los casos. Sin texto recortado ni desbordamiento horizontal del documento, acción explícita y punto central pulsable, cero controles interactivos anidados. Contraste mínimo 4,8489:1 (incluida «Nueva»), superior a 4,5:1. Reapertura real con Enter y foco visible de al menos 2 px, cierre con Escape, y clic en «Ver crónica» que abre el diálogo y vuelve a Inicio con data-unseen false. Cero errores de consola y de página en la matriz; no se afirma una auditoría global de red.

La primera medición de contraste interpretaba OKLab como RGB y dio un fallo falso en «Nueva». El runner se corrigió para convertir los colores con Canvas del navegador y se repitió la matriz completa. El primer reporte se conserva en scratch; no se modificó el producto para pasar una medición errónea.

[Reporte de los 24 casos](wrap-home/report.json).

## Capturas

- [Inicio anterior, móvil claro](wrap-home/before-home-320-light.png).
- [Tarjeta ya vista, móvil claro](wrap-home/seen-320-light.png).
- [Tarjeta anual, móvil oscuro](wrap-home/year-390-dark.png).

## Alcance y limpieza

Las fixtures emplearon cuentas qa_exp_ desechables en dev, eliminadas al terminar. La consulta posterior devuelve cero crónicas de cada actor. No se sustituyen crónicas de cuentas QA persistentes ni se usan datos de producción. No hay migraciones ni cambios nativos. La publicación se sigue en la PR de #1441; estas comprobaciones corresponden al candidato local/dev.
