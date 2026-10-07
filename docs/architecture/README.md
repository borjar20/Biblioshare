# Mapa de arquitectura (máquina + humano)

> **[Delta Novedades · 2026-10-07: calidad por obra, enriquecimiento TMDB opcional,
> idioma de sinopsis y enlaces públicos contrastados con código, SQL local/dev/producción,
> build/start y navegador. Primera versión activa en producción desde el 2026-10-06;
> esquema de calidad aplicado en producción; código en PR #1452, seguimiento en #1451/#1449. `graph.json` y `map.html` sincronizados.
> Evidencia y límites en [el informe](../testing/2026-10-07-novedades-quality.md).
> Los demás deltas conservan su alcance.]**

> **[Delta #1385 · verificado el 2026-10-05: ChromeBoundary separa ruta y sesión. Cinco regresiones y 26 controles PASS, revisión independiente sin hallazgos; build nueva e5fdb395 pasa MTG original 2/2 y retorno 2/2 con cero React #418. Global FAIL por 16 RSC cancelados y gate de inventario completo FAIL por 56 route-cache nuevos; 2445 archivos previos y 3272 fuentes idénticos, parada física PASS. CI integrada pendiente. El resto conserva sus fechas y alcance.]**

> **[Derivado · delta de celebraciones recuperables #1334 verificado contra código, 75 unitarios y PostgreSQL local cold-r2 el 2026-10-03; revisión independiente PASS. El flujo nuevo distingue claim, presentación y ACK. G4 nativo, activación remota y CI pendientes al registrar el delta.]**

> **[Delta verificado el 2026-10-04 · #1334: G4 local de build `gmpZaurRiZDtN1lTctOQI` acredita recuperación después de claim perdido, presentación y ACK. Auditoría global FAIL de 390 incidentales conservada en #1301; tres fronteras nativas pendientes en #1356. Dev y producción activos: corte productivo de las 20:16:22 UTC, cuatro RPC invoker iguales a dev, grants 11/11/11, legacy compatible de cero filas y datos/ledger previos intactos, tras guard de quiescencia real. El corte de las 20:16:22 UTC precede a la entrega del consumidor, seguida en PR #1364; no acredita presentación remota. El delta anterior conserva su fecha y alcance.]**

> **[Derivado · generado desde el código el 2026-10-05; delta de notas en el margen (#1380) integrado en graph.json (nodos `t-margin-notes`, `m-margin`, `c-margin`, `r-margen`, flujo `flow-margin-note`), esquema verificado en dev y en producción el 2026-10-05; delta de reseñas por momento de Experiencias (#1293): corte local/dev contrastado con las cinco migraciones iniciales 20261004100000-100400 e integrado en graph.json (nodo `t-experience-reviews`, flujo `flow-experience-review`); aplicación y verificación en producción de las seis migraciones 20261004100000-100500 el 2026-10-04 documentadas en el [informe de producción](../testing/2026-10-04-experiencias-resenas.md#verificación-de-producción-y-alcance-2026-10-04), recogido en PR #1378; sin fixtures ni recorrido autenticado de reseñas acreditados en producción; delta de navegación por áreas verificado contra código, unitarios focales e integridad del mapa (11 recorridos funcionales, 32 vistas y 8 menús verificados contra build/start local; 4304 unitarios PASS). Incluye cinco destinos principales, Comunidad, herramientas de Biblioteca y perfil centrado en lo compartido; conserva captura breve y álbum de Experiencias #1293 (código local/dev; ocho migraciones aplicadas y esquema/permisos verificados en producción el 2026-10-03 a las 10:04 UTC; integración/despliegue en PR #1323 y #1293), y las verificaciones anteriores de créditos #633, Partidas #964/#995, hidratación #1290, ZIP #1250, economía R5, fusiones #875 y retorno al login #1271. Las fuentes y el alcance de cada delta constan en meta.verifiedAgainst; utilidad compartida de vibración #996 verificada por equivalencia e imports; delta de publicación confirmada del Reloj #1313 verificado contra candidato r3, 163 unitarios (25 durables) y revisión independiente (6 + 5 diagnósticos) el 2026-10-03; 19 casos Clock nativos PASS en build nuevo (18 iniciales + 1 recuperación focal); tanda conjunta y FAIL global de POST conservados en #1328/#1301; CI exigida en la PR; delta del reporte push #1052 verificado con 116 unitarios y revisión independiente de 1.144 escenarios; primera CI 4.201 unitarios/123 recorridos; diagnóstico seguro de salud #1329 verificado con 51 pruebas focales y tres diagnósticos independientes PASS el 2026-10-03; Recursos #1328/#1007: 57 unitarios, ocho casos nativos y un contexto visual PASS en build w0f/base4a; base Experiencias integrada, 95 unitarios focales y nueve recorridos funcionales actuales PASS en build zOSPb8W0Exp_IruBgC7iv/backend282; FAIL global conservado en #1301/#1334, CI final exigida en la PR; delta documental #937/#938: referencia de esquema y recorrido de partida contrastados estáticamente con rutas, imports y persistencia en main e4f33f2 el 2026-10-03, sin nueva ejecución funcional, de navegador o de backend; delta de cabecera y notificaciones #1349 verificado contra código, build Next 16.3.8 y siete E2E focales build/start local el 2026-10-04 (19,7 s, cero reintentos/skip/flaky; 320/360/390/412/768 px, claro/oscuro y 320 × 360 px); 17 unitarios focales y suite general de 459 archivos/4565 pruebas PASS; lista larga de 20 avisos sintéticos solo en respuesta de lectura con scroll alcanzable; consola sin errores en los cinco casos nuevos, ERR_ABORTED y oclusión parcial por mascota conservados en el informe; verificación sobre candidato local; integración/publicación rastreadas en [PR #1351](https://github.com/borjar20/Biblioshare/pull/1351)]**

Dos vistas de lo mismo, pensadas para lectores distintos:

| Fichero | Para quién | Qué es |
|---|---|---|
| [`graph.json`](./graph.json) | **Agentes IA** | Nodos, aristas y flujos con rutas de fichero. Estructurado, diffeable, consultable |
| [`map.html`](./map.html) | **Personas** | Diagrama interactivo + flujos resaltables. Autocontenido: doble clic y listo |
| [`sync.mjs`](./sync.mjs) | Mantenimiento | Comprueba referencias de `graph.json` y lo re-embebe en `map.html` |

**Esto es un doc DERIVADO, no canónico.** Para rutas y capas manda
[ARQUITECTURA.md](../ARQUITECTURA.md); para el esquema,
[data-model.md](../requirements/data-model.md). Si este mapa los contradice, están
ellos en lo cierto y el mapa está viejo.

La navegación actual sale de `src/components/nav/nav-items.ts`: Inicio,
Biblioteca, Experiencias, Comunidad y Buscar. `AppMenu` reúne Partidas, Mascota
y Ajustes; el avatar enlaza directamente al perfil. `/comunidad` reutiliza
`ClubLists` y `PeopleResults`, mientras `/coleccion/rincon` conserva el contenido
privado de `RinconTab` con identidad de sesión. Los nodos `r-comunidad`,
`r-coleccion`, `r-perfil` y `c-nav` señalan los ficheros reales; el flujo
`flow-stats` comienza en las herramientas de Biblioteca.

La cabecera móvil del usuario con perfil muestra marca, campana, Más y avatar;
Cambiar tema vive en Más bajo 768 px y mantiene el icono directo desde 768 px.
`c-nav` incluye `Header`, `AppMenu`, `NotificationBell` y `ThemeToggle`.
El panel de la campana se ancla a la cabecera sticky en móvil y a la campana
en escritorio; su única zona de scroll queda acotada al viewport, con reserva
para barra inferior y safe-area en móvil. Escape devuelve el foco a la campana;
el puntero y el foco fuera también cierran el panel. Este delta #1349 se
verifica con código, build Next 16.3.8 y siete E2E focales contra build/start
local: cinco nuevos y dos de navegación/avatar. Con 20 avisos sintéticos solo
en la respuesta de lectura, el scroll alcanza el último aviso y el footer
dentro de la región. La evidencia conserva las peticiones ERR_ABORTED y la
oclusión parcial del footer por la mascota; no acredita publicación.
Evidencia y alcance:
[cabecera y notificaciones](../testing/2026-10-04-header-notifications.md).

Las rutas nuevas declaran sus providers en los layouts: Comunidad envía
`club` para sus islas de cliente; el Rincón conserva `collection`, `library`
y `search` junto con `stats`, `challenges`, `notes` y `rincon`. Un
`RouteMessages` anidado reemplaza los mensajes del padre; sus gotchas están
en `r-comunidad` y `r-coleccion`. Los textos de `PeopleResults` se componen
en servidor.

Inicio con sesión incorpora resúmenes y despliegues inline exclusivos bajo
1100 px; escritorio conserva los paneles completos salvo anuncios semanales
breves y barras de los laterales ocultas. `r-home` incluye HomeExpandable y su
contexto en el layout: contenido montado, CSS grid0fr/1fr e inert; limpieza de
Activity/ruta/breakpoint recoge la vista preservando el estado funcional. HomeRail
mide su alto real incluyendo el saludo. `c-wrap-ups` conserva HomeWrapUp y el
reproductor al pulsar, con identidad fijada y datos reconciliados. Evidencia local
del delta en [Inicio inline](../testing/2026-10-07-inicio-inline.md); los diseños
previos son históricos. Publicación seguida en #1453/#1454 y PR #1457.

## Para agentes: cómo usar `graph.json`

Empieza por **`flows`**. Cada flujo es un recorrido end-to-end (registrar una sesión,
importar un CSV, derivar el mapa de una saga…) con sus pasos **en orden** y el fichero
que toca cada uno. Es el atajo para localizar dónde vive una feature sin barrer el repo.

```bash
# ¿Qué ficheros toca registrar una sesión?
node -e "const g=require('./docs/architecture/graph.json');
  g.flows.find(f=>f.id==='flow-session').steps.forEach((s,i)=>
    console.log(i+1, s.node.padEnd(14), s.file||''))"

# ¿Qué depende de lib/passes?
node -e "const g=require('./docs/architecture/graph.json');
  console.log(g.edges.filter(e=>e.to==='m-passes').map(e=>e.from+' ('+e.kind+')').join('\n'))"

# Las trampas registradas, de una tacada
node -e "const g=require('./docs/architecture/graph.json');
  g.nodes.filter(n=>n.gotchas).forEach(n=>n.gotchas.forEach(x=>console.log('·',n.label+':',x)))"
```

Claves del formato:

- `meta.invariants` — las reglas duras del proyecto, con su evidencia en el código y,
  cuando existe, el bug que ya las rompió. **Léelas antes de proponer un cambio de forma.**
- `meta.layers` — el orden de las capas (cliente → edge → rutas → UI → actions →
  dominio → acceso a datos → Postgres → externos). Da la dirección "legal" de las
  dependencias.
- `nodes[].files` — punto de entrada de lectura. `nodes[].gotchas`, lo que ya costó horas.
- `nodes[].hub` marca los nodos por los que pasa todo (`passes`, `lib/reactivity`);
  `nodes[].frozen` marca lo que NO hay que tocar (`library_entries`).
- `edges[].kind` — `renders | calls | reads | writes | revalidates | fetch | auth`.

## Mantenerlo vivo

Edita **siempre `graph.json`**; `map.html` lleva una copia incrustada (tiene que ser
autocontenido) y este script es lo que impide que diverjan:

```bash
node docs/architecture/sync.mjs
```

Comprueba ids de nodo duplicados, capas y tipos de arista conocidos, extremos de
aristas y nodos de pasos existentes, flujos con pasos y ausencia de `</script` en el
JSON incrustado. No valida un JSON Schema ni comprueba la existencia de ficheros
referenciados o la correspondencia de dependencias con imports: esa revisión se
hace contra el código. `--check` sólo comprueba esa integridad; no escribe ni compara
la copia de `map.html`. Para sincronizar el HTML, ejecuta el comando sin `--check`.

Actualízalo cuando cambie **la forma**, no con cada commit:

- una **ruta nueva** en `src/app` (o una que desaparece) → nodo en la capa `route`;
- un **módulo nuevo** en `src/lib` → nodo en `domain` y sus aristas;
- una **tabla nueva** o retirada → nodo en `db` (el canónico del esquema sigue siendo
  [data-model.md](../requirements/data-model.md); aquí solo se resume);
- un **flujo que cambia de camino** — los `steps[].file` son lo primero que se queda
  obsoleto, y son justo lo que hace útil el fichero;
- un **invariante nuevo**, o uno que se rompe → `meta.invariants`.

Al hacerlo, sube `meta.generatedAt` y la fecha de la cabecera de arriba.

El [chequeo de deriva](../DRIFT-CHECK.md) (superficie 3) trae los dos comandos para
detectar que este mapa ya miente.

### Dos trampas

- **`map.html` lleva una copia del JSON incrustada.** Tiene que ser autocontenido (se abre
  con doble clic, sin servidor). Editar solo el HTML, o solo el JSON sin correr `sync.mjs`,
  los desincroniza **en silencio**: el diagrama sigue pintando bien, con datos viejos.
- **El encuadre inicial daba `scale(0)`** si la página cargaba con el contenedor a tamaño
  cero (pestaña oculta, panel plegado), y se quedaba en blanco para siempre. Está resuelto
  posponiendo el `fit()` y reintentándolo con un `ResizeObserver`; si alguien reescribe esa
  función, es el fallo al que se vuelve.

### Por qué no está en CI

`sync.mjs --check` está listo para un hook o un workflow, pero se dejó **fuera a propósito**:
un check que falle por un doc derivado bloquearía PRs de código que no tienen nada que ver.
Si el mapa demuestra que se pudre igual, la alternativa es meterlo como check no bloqueante.

> **Delta 2026-10-06:** crónicas (`r-wrap-ups`, `m-wrap-ups`, `c-wrap-ups`, `t-wrap-ups`, `flow-wrap-up`), verificadas contra código, regresiones, SQL dev con rollback y QA 32 escenarios build/start. Producción/cron remoto verificados el 2026-10-07 en [#1433](https://github.com/borjar20/Biblioshare/issues/1433); despacho dev separado en #1439.
