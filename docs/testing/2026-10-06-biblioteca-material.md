# Biblioteca material — verificación del 2026-10-06

> **[Canónico · verificación local contra código y build/start el 2026-10-06]**
> Acredita los controles focales indicados. Merge en main y publicación no se
> verifican en esta sesión.

## Resultado y entorno

El coordinador acredita **146 unitarios focales PASS en 15 archivos**, incluidos
18 casos nuevos de `library-item-card.test.tsx` y `library-highlights.test.tsx`,
**TypeScript, lint focal de los TSX modificados y sus pruebas, y build de Next
16.3.8 PASS**, con revisión independiente sin hallazgos.
La comprobación documental independiente también termina sin hallazgos.
Estos controles no son una ejecución de la suite general ni de Android nativo.

Navegador Chromium/MS Edge contra `next start` en `http://localhost:3100`.
El último delta del botón de cabecera se comprueba con la build
`RaFEaEDxvP3gBPTU8b4sG`. Las credenciales configuradas se cargan sin registrarlas
ni incluirlas en los artefactos. La tanda conserva `createdData = 0`: se abren
hojas sin enviar formularios ni cambiar el favorito.

## Integración local tras el rebase

El candidato se integra localmente con `origin/main` `4ac41fc7` el 2026-10-06.
La repetición del mismo comando focal acredita **148 tests PASS en 15 archivos**
(dos casos de navegación entrantes desde main), lint focal PASS y build/TypeScript
PASS: compilación de 20,7 s, TypeScript de 56 s y 86 rutas estáticas. Es una
verificación local, sin acreditar merge, publicación o CI de este candidato.

Los 146 unitarios anteriores y la evidencia de navegador de este informe
pertenecen al candidato previo al rebase y a su build `RaFEaEDxvP3gBPTU8b4sG`.
La matriz y los controles 27 + 6 no se presentan como repetidos sobre la
integración posterior. Se conservan sus observaciones y límites.

## Matriz visual y control del último delta

La primera build acredita **ocho vistas**: 320/390/768/1280 px, claro y oscuro,
con 24 tarjetas y Destacados, sin overflow horizontal. Hay 48 comprobaciones de
título/silueta: libro con lomo, película/serie sin él. Las cuatro aperturas de
«Añadir a colección» y sus cierres con Escape conservan la URL. En los cuatro
anchos, movimiento reducido da duración `0s` y transform `none`.

La build final acredita **27/27 checks focales PASS** en `final-focused.json`:

- Cabecera a 320 y 390 px sin overflow ni solapamiento entre título y CTA.
  «Añadir obra» mide 121,5 × 44 px y conserva 16 px al borde derecho en ambos
  tamaños. A 320 px el título ocupa dos líneas; a 390 px, una.
- Apertura/cierre de hoja a 320/390 px; filtros por la UI: seis libros,
  24 películas de la página y dos series. Filtro combinado de libro/completado
  y orden por título conservados en URL; búsqueda sin resultados y pestañas
  Todo / Colecciones / Sagas.
- Favorito inicial conservado; hover de puntero fino con desplazamiento `-3px`,
  foco con objeto quieto y outline de 2 px; movimiento reducido con `0s`/`none`.
- CTA de sesión con destino al pase activo correcto. La apertura real del
  formulario interceptado se acredita en el control posterior indicado abajo.

La matriz de ocho vistas pertenece a la build anterior al ajuste final de
altura/padding del CTA; no se presenta como repetida íntegramente sobre la
última build. El control focal verifica el delta y las interacciones indicadas.

## Formulario de sesión real

`final-session-dialog.json` acredita **6/6 checks PASS**: formulario del pase
activo visible dentro del dialog interceptado, «Guardar sesión» presente y
habilitado, cierre sin guardar hacia la URL original de Biblioteca con sus
filtros y favorito sin cambios. La página de Biblioteca del snapshot inicial
es el fondo conservado por la ruta interceptada; el control posterior espera
el formulario y registra el snapshot específico del dialog.

## Cortes del recorrido automático

Se conservan los intentos previos, sin convertir el contador de checks en un
PASS global. Dos cortes a 320 px esperaron la hoja de colección después de
calcular coordenadas tras cambiar el viewport. El control `hit-diagnosis.json`
comprueba la diana táctil visible, abre la hoja y conserva URL y favorito;
el diagnóstico del coordinador acota esos cortes al desplazamiento del harness.

`verification.json` alcanzó 73 comprobaciones verdaderas y ninguna falsa,
pero terminó por timeout del locator «Películas»: después de cambiar a Libros,
el dropdown de filtros permaneció abierto durante la navegación RSC y el
segundo clic del script lo cerró. Acredita la matriz y las cuatro hojas
anteriores al corte. El helper focal abre el dropdown solo si está cerrado y
espera la URL del destino; el control de la última build se registra por separado.

## Consola, red y superposición

La tanda inicial registra cero errores de consola, excepciones de página o
respuestas HTTP de error, junto con **36 `net::ERR_ABORTED`**. La focal final
registra también cero errores de consola/página/HTTP y **71 abortos: 69 GET y
2 POST**. El control posterior del formulario registra cero errores de
consola/página/HTTP y **18 abortos: 17 GET y 1 POST**. Son cortes distintos:
no se suman ni se atribuyen a una causa común.
Son observaciones nuevas del seguimiento [#1301](https://github.com/borjar20/Biblioshare/issues/1301);
el resultado funcional no demuestra inocuidad de los abortos ni una red limpia.

A 390 px, la mascota flotante existente se superpone a una tarjeta. Es una
observación del seguimiento [#1350](https://github.com/borjar20/Biblioshare/issues/1350).
Este cambio no añade otra mascota ni corrige la capa global.

## Evidencia y alcance

Los JSON y capturas locales, no versionados, están en `library-qa/` dentro de
las visualizaciones de esta tarea: `matrix-baseline.json`, `final-focused.json`,
`final-session-dialog.json`, `hit-diagnosis.json`, `verification.json` y los dos
cortes `verification-*-fail.json`. Capturas del candidato final:
`final-header-320.png`, `final-header-390.png`, `final-mobile-390-clean.png`,
`final-desktop-1280-clean.png` y `final-session-dialog-390.png`.
El código durable de pruebas vive en
[`library-item-card.test.tsx`](../../src/components/library/library-item-card.test.tsx)
y [`library-highlights.test.tsx`](../../src/components/library/library-highlights.test.tsx).

El alcance es `/coleccion`: presentación material opt-in, Resumen/Destacados,
herramientas, pestañas y filtros. Perfil y plano de datos conservan su contrato;
no cambia el esquema, las APIs, RLS, consultas ni caché.

La tanda cierra sus navegadores; el coordinador detiene el servidor de pruebas
en 3100 y elimina los scripts temporales, conservando la evidencia local.
No se modificaron filas de catálogo, pases, colecciones o favoritos.
