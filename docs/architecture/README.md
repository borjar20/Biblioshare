# Mapa de arquitectura (máquina + humano)

> **[Derivado · generado desde el código el 2026-07-27]**

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

Actualízalo cuando cambie **la forma**, no con cada commit: una ruta nueva, un módulo
nuevo en `src/lib`, una tabla nueva, un flujo que cambia de camino. Al hacerlo, sube
`meta.generatedAt` y la fecha de la cabecera de arriba.
