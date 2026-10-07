# Inicio móvil inline — verificación del 2026-10-07

> [Canónico para este corte local · PR #1457 · no acredita despliegue]

El usuario sustituye la ampliación por modales por «Desplegar dentro de Inicio».
Hoy, Novedades y Actividad usan regiones inline, con un bloque abierto a la vez.
Hoy y Actividad convierten su resumen en cabecera; las novedades conservan su
posición junto a crónica y despliegan el detalle a ancho completo debajo. Crónica
mantiene StoryPlayer. PC conserva su presentación, novedades breves y barras ocultas.

Base 92776090; implementación d414b5a4 y correcciones posteriores. Node22.23.1,
Next16.3.8, build final AQjhfFuJrDuSNkvuSe4qA. Backend local desechable
biblioshare-local-4d708a0f con306 pasos y activación protegida previa a los actores.
Sin migraciones de aplicación ni consultas nuevas. Los actores y sus filas de CI
se limpian antes y después; nunca se usan cuentas reales ni credenciales remotas.

## Evidencia focal

- TodayPicker: RED4/5 al exigir regiones/exclusión/scroll libre, GREEN5/5.
- Revisión independiente del delta92776090..d414b5a4: P2Activity conservaba el
  bloque abierto al ocultarse Inicio. Regresión real React/JSDOM RED1/6;
  cleanup de useLayoutEffect en provider y fallback, GREEN6/6. El contador hijo
  sigue en1 al volver a abrir: se recoge el detalle, no se reinicia su contenido.
- E2E detectó que una hoja de sesión cacheada con open=true podía impedir Escape.
  El guard ahora considera solo hojas renderizadas. REDpropio; GREEN7/7 de
  TodayPicker y3/3 de HomeWrapUp. Con el guard de revalidación,11/11 PASS a15s.
- TypeScript y build final PASS; lint focal PASS. CSSvisibility oculta el detalle
  plegado antes de hidratar; inert evita foco, sin montar/desmontar los controles.
  CSS grid0fr/1fr revierte transiciones al cambiar de bloque y respeta movimiento
  reducido. El skeleton semanal reserva106px, incluyendo el gap de la fila plegada.

Los primeros cuatro recorridos reales (320/390/768/1280) pasaron. El assert previo
que exigía cero animaciones inmediatamente al cambiar de viewport se adaptó a
polling acotado para esperar el asentamiento de transiciones CSS. El corte final
incluye sesión/atrás, navegación completa a Biblioteca/atrás, draft del feed,
selección persistente, exclusión de paneles y recogida desde el final del contenido.
**Corte final:6/6 PASS,29,9s, cero reintentos/skip y sin errores JavaScript de página.**

## Suite general y límites

Primera suite general:547 archivos,5415 PASS/1 FAIL por timeout5s en
revalidate-guard.test.ts, al recorrer src/. No fue una infracción revalidatePath.
La repetición focal con15s pasa; antecedentes abiertos#1395/#1402. El corte
completo siguiente mantiene las mismas aserciones y usa15s de timeout local;
no cambia la configuración del proyecto ni la guarda de revalidación.

Los logs mantienen warnings previos Gzip/stream-close (#1251/#1263/#1301); no se
atribuyen sus causas ni se silencian. La revisión no incluye lector de pantalla
real, Safari ni wrapper Android. El diseño y plan anterior con modales permanecen
como historia; UI-GUIA, decisiones y mapa describen el comportamiento inline.


| Recorrido final | Resultado |
|---|---|
| 320×640 claro / movimiento reducido | Resumen compacto, primer post dentro del viewport útil, regiones inline sin dialog, selección y retorno PASS |
| 390×844 claro / movimiento normal | Cabecera transformada, borrador de feed conservado, exclusión de bloques, footer/retorno, crónica/publicación/despublicación PASS |
| 768×844 oscuro / movimiento reducido | Regiones y cuatro bloques, foco/scroll natural y ancho sin desborde PASS |
| 1280×680 | Presentación completa y barras ocultas, último anuncio sin bajar feed, enlace a Novedades PASS |
| Resize y navegación | Transiciones asentadas, sesión/atrás y Biblioteca/atrás recogidas, reapertura y Escape PASS |
| Cola/colección/descubrimiento/novedades vacías | Controles funcionales y enlace general conservados PASS |

Capturas de app conservadas en el directorio de visualizaciones de la conversación:
home-inline-320.png, home-inline-390.png, home-inline-768.png,
home-inline-desktop.png y home-inline-expanded.png. La captura ampliada espera
el final de las transiciones CSS. Los mocks anteriores no acreditan este corte.


Corte general final: **547 archivos / 5417 pruebas PASS**,253,94s, con
`--maxWorkers=2 --testTimeout=15000`. Se conservan el timeout previo de5s y los
antecedentes#1395/#1402; no se cambia ninguna aserción ni el límite del proyecto.
Lint focal PASS y build/TypeScript PASS. Entorno propio cerrado: puerto3000 libre,
backend biblioshare-local-4d708a0f detenido sin backup; build y directorios locales
generados se retiran al guardar la entrega, restaurando la copia de .env.local.
Rama y worktree administrado se conservan para revisar PR1457; no se integra en main.
