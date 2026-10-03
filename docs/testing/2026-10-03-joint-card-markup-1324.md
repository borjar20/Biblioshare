# HTML e hidratación de la media de JointCard (#1324)

> **[Evidencia · verificada el 2026-10-03 · regresión SSR/parser/hidratación aislada y checks estáticos PASS]**

Base de la corrección: `690bf4b7f614e299b2ae88fa7bde409406e50977`, desde
`origin/main`. Node 24.19.0, React/React DOM 19.2.4, Vitest 4.1.11 y jsdom 30.0.1.
No se modifican dependencias, traducciones, esquema ni la PR de Experiencias.

## Problema y corrección

La fila «Media del grupo» estaba dentro de un `p`; `RatingDots` en lectura
genera un `div role="img"` con otro `div` dentro. El parser HTML cierra el
párrafo antes del bloque, por lo que el DOM recibido no coincide con el árbol
que React intenta hidratar.

La corrección cambia únicamente ese contenedor a `div`. Conserva todas sus
clases, texto, cálculo, condición de visibilidad y etiqueta accesible de la
nota. La media sigue derivándose sólo de los miembros visibles y sigue sin
aparecer con menos de dos notas.

La regresión en `src/components/social/review-joint-cards.test.tsx` renderiza
`JointCard` y `RatingDots` reales con tres miembros sintéticos y notas 9/8/10.
Interpreta la salida de `renderToString` mediante `innerHTML` y la hidrata con
`hydrateRoot`. Exige cero errores recuperables, cero llamadas a `console.error`
y conservación del mismo nodo `article`, sin una reconstrucción cliente. No
comprueba una etiqueta concreta ni busca texto en el fichero fuente. El reloj
se fija y la raíz, el contenedor y los spies se limpian en `finally`.

Se conservan los mocks existentes del router de Next y de la acción de borrar.
No se simulan los componentes que producen el marcado problemático, ni se
ejecutan borrados, peticiones a Supabase o navegación de la aplicación.

## Red y green conservados

| Pasada | Resultado | Qué acredita |
|---|---|---|
| Baseline del caso de contenido | 1 PASS, 7 excluidos por filtro; 1,87 s | El texto y la media pasan aun con los dos avisos de anidación en stderr |
| RED v1, producto anterior | 1 FAIL, 8 excluidos; 1,81 s | React recibe un error recuperable de hidratación; también hay un aviso de `act` del harness inicial |
| RED v2, harness corregido, producto anterior | 1 FAIL, 8 excluidos; 1,73 s | Mismo error de hidratación y avisos de anidación, sin el aviso del harness |
| GREEN v1, archivo completo | 9 PASS, 0 FAIL, 0 SKIP; 2,08 s | La hidratación conserva el artículo y no registra errores; pasan los ocho casos de contenido anteriores |
| TypeScript | PASS, exit 0 | `tsc --noEmit --incremental false` |
| ESLint de los dos archivos modificados | PASS, exit 0, sin warnings | Lint focal con `--max-warnings=0` |
| Diff | PASS | `git diff --check` |

El FAIL material de RED v2 fue la aserción de cero errores recuperables: se
recibió uno con este mensaje:

```text
Hydration failed because the server rendered HTML didn't match the client.
As a result this tree will be regenerated on the client.
```

El stderr también identifica `In HTML, <div> cannot be a descendant of <p>`.
El caso se ejecutó antes de la corrección de producto, no reintroduciendo el
defecto después del green.

## Reproducción acotada

Desde la raíz del checkout, con un Node admitido por `package.json`:

```powershell
$jointNode24 = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $jointNode24 node_modules/vitest/vitest.mjs run src/components/social/review-joint-cards.test.tsx --maxWorkers=1 --no-file-parallelism
& $jointNode24 node_modules/typescript/bin/tsc --noEmit --incremental false
& $jointNode24 node_modules/eslint/bin/eslint.js src/components/social/joint-card.tsx src/components/social/review-joint-cards.test.tsx --max-warnings=0
git diff --check
```

La regresión sola se selecciona con `-t 'hidrata la media del grupo'`; el
baseline de la issue, con `-t 'media del grupo'` sobre el archivo anterior a la
regresión. La pasada completa actual no excluye ningún test del archivo.

## Artefactos y límites

Logs y JSON nativos se conservan localmente bajo `.scratch/joint1324/` en las
rutas `baseline-v1`, `red-v1`, `red-v2` y `green-v1`; los checks estáticos,
en `static-v1` y `eslint.log`. SHA256 RAW de los logs:

| Artefacto | SHA256 |
|---|---|
| `baseline-v1/run.log` | `b950667b2ef778e0bbd1aca71c0b5e485309062049ac0645a40ba052e5c46b2c` |
| `red-v1/run.log` | `4740275118bebd1f0a7163d0f0763da7d4aed454f8569057ec6ea304571e69de` |
| `red-v2/run.log` | `9033311fa0f30e91db8f1172192fad654c443fe8baba58d01937b6c7977736ee` |
| `green-v1/run.log` | `f60ba8e175a62844ead8e0219659270d6d8f870a905faf03ecdaa974764230bf` |

`ssr-v1/card.html` es una exportación adicional del componente real con
identidades, título y datos sintéticos, sin credenciales. SHA256 RAW:
`5fdc9028c7d969fb1fe92c7ff487c02af3fb48caed87c94ea8f1f0172efc36c3`.
Permite inspeccionar el HTML en un parser nativo. No incorpora CSS de la app
ni bundle de hidratación; su generación no acredita una validación visual o
una hidratación en el navegador de la aplicación.

La reproducción confirmada de hidratación usa React real y jsdom. No se
arranca Next, no se ejecuta la suite completa ni se prueba producción o el
navegador de la app. Sigue sin estar confirmada una víctima funcional en
producción: el defecto acreditado es el HTML inválido y la discrepancia de
hidratación en esta reproducción aislada.

No cambia una feature, un contrato de datos ni una decisión de arquitectura;
por eso no requiere cambios de backlog de features, modelo de datos o mapa.
La issue #1324 rastrea el defecto y su cierre tras integrar la corrección.

## Comprobación adicional con el parser nativo

El 2026-10-03, Chromium `149.0.7827.55` abrió el HTML SSR anterior con
JavaScript desactivado: **5 PASS**, 603 ms. El navegador conservó un único
artículo, sin párrafos vacíos añadidos por reparación; el rótulo de media,
la valoración accesible y `4,5` quedaron dentro del mismo `div`. También se
verificaron las cuatro valoraciones accesibles y su asociación con los
participantes. No hubo peticiones HTTP ni errores; el navegador se cerró.
El SHA256 del HTML coincidió antes y después.

Esta comprobación acredita la estructura y semántica tras el parser real.
No cargó CSS ni JavaScript de la aplicación y no acredita su maquetación,
hidratación o flujo de datos. La regresión de hidratación sigue siendo la
prueba aislada con React real descrita arriba.

Los cinco artefactos públicos se conservaron y verificaron por tamaño y
SHA256 fuera del worktree en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/joint1324-parser-1791028741445/`:

- `result.json`: `9f82b94da2c7be1d3b1c39f9434e0181ffa30aa6a018797df47b896012cf1f33`.
- `manifest.sha256.json`: `32376624d461fae9e47090b79c48bcf5491bcd63d77c2cd5241b894a6fcec75f`.
- `parsed-dom.json`, `browser-serialized.html`, `accessible-article.yaml` y
  `verify.mjs` conservan la estructura observada y el procedimiento.
