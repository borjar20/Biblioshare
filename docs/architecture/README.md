# Mapa de arquitectura (máquina + humano)

> **[Derivado · generado desde el código el 2026-10-03; delta de navegación por áreas verificado contra código, unitarios focales e integridad del mapa (11 recorridos funcionales, 32 vistas y 8 menús verificados contra build/start local; 4304 unitarios PASS). Incluye cinco destinos principales, Comunidad, herramientas de Biblioteca y perfil centrado en lo compartido; conserva captura breve y álbum de Experiencias #1293 (código local/dev; ocho migraciones aplicadas y esquema/permisos verificados en producción el 2026-10-03 a las 10:04 UTC; integración/despliegue en PR #1323 y #1293), y las verificaciones anteriores de créditos #633, Partidas #964/#995, hidratación #1290, ZIP #1250, economía R5, fusiones #875 y retorno al login #1271. Las fuentes y el alcance de cada delta constan en meta.verifiedAgainst; utilidad compartida de vibración #996 verificada por equivalencia e imports; delta de publicación confirmada del Reloj #1313 verificado contra candidato r3, 163 unitarios (25 durables) y revisión independiente (6 + 5 diagnósticos) el 2026-10-03; 19 casos Clock nativos PASS en build nuevo (18 iniciales + 1 recuperación focal); tanda conjunta y FAIL global de POST conservados en #1328/#1301; CI exigida en la PR; delta del reporte push #1052 verificado con 116 unitarios y revisión independiente de 1.144 escenarios; primera CI 4.201 unitarios/123 recorridos; diagnóstico seguro de salud #1329 verificado con 51 pruebas focales y tres diagnósticos independientes PASS el 2026-10-03]**

Dos vistas de lo mismo, pensadas para lectores distintos:

| Fichero | Para quién | Qué es |
|---|---|---|
| [`graph.json`](./graph.json) | **Agentes IA** | Nodos, aristas y flujos con rutas de fichero. Estructurado, diffeable, consultable |
| [`map.html`](./map.html) | **Personas** | Diagrama interactivo + flujos resaltables. Autocontenido: doble clic y listo |
| [`sync.mjs`](./sync.mjs) | Mantenimiento | Valida `graph.json` y lo re-embebe en `map.html` |

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

Las rutas nuevas declaran sus providers en los layouts: Comunidad envía
`club` para sus islas de cliente; el Rincón conserva `collection`, `library`
y `search` junto con `stats`, `challenges`, `notes` y `rincon`. Un
`RouteMessages` anidado reemplaza los mensajes del padre; sus gotchas están
en `r-comunidad` y `r-coleccion`. Los textos de `PeopleResults` se componen
en servidor.

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

Valida integridad referencial (aristas y pasos que apuntan a nodos inexistentes, capas
y `kind` desconocidos, ids duplicados) y regenera el HTML. `--check` valida sin escribir.

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
