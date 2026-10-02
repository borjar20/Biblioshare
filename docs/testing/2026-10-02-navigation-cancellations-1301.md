# Cancelaciones observadas durante la navegación (#1301)

> **[Evidencia · observación instrumentada verificada el 2026-10-02; los cinco abortos históricos siguen sin clasificación]**

El helper de causalidad del título rechazaba cualquier `requestfailed`.
Su tanda original observó cinco `net::ERR_ABORTED` sin tipo de recurso ni
fase de navegación. El resultado global **FAIL** se conserva: no permite
afirmar que aquellas cinco peticiones fueran prefetch ni fallos funcionales.
Los veinte casos permanentes de esa tanda fueron PASS, con alcances separados.
El detalle y sus hashes están en
[google-volume-hydration-1290.md](2026-10-02-google-volume-hydration-1290.md).

## Observación nueva

Una tanda nueva registró método, tipo de recurso, condición de navegación,
fase al inicio/final y únicamente indicadores booleanos de RSC/prefetch. No
guardó cookies ni cabeceras completas. Las tres cancelaciones observadas tienen
la misma evidencia:

| Ruta | Método / tipo | Navegación | Fase inicio / final | RSC / router prefetch / query RSC |
|---|---|---|---|---|
| `/login` | GET / fetch | false | goto / goto | true / true / true |
| `/buscar` | GET / fetch | false | goto / goto | true / true / true |
| `/` | GET / fetch | false | goto / goto | true / true / true |

Los indicadores `segmentPrefetch` y `purposePrefetch` son false. La clasificación
`PREFETCH_CANCELLED` procede del indicador explícito de router prefetch, no de
la URL ni del texto `ERR_ABORTED`. Hubo **cero peticiones sin clasificar, fallos
HTTP, errores de página o consola**. Es un PASS de esta observación nueva;
no cambia el FAIL anterior ni clasifica las dos rutas históricas restantes.

El helper comprobó el texto completo y el cambio de anchura 601 → 320/375 px
al comparar temporalmente `normal` y `anywhere`, restaurando el estilo original.
Ese build usa el hero anterior a #1300, por lo que la comparación es evidencia
causal adicional y no una prueba del commit de entrega de #1300. La fixture
propia quedó eliminada en la auditoría final de la tanda, sin residuos.

## Evidencia y límites

Archivos conservados en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/integration-1790938830828/`:
`network-causality.mjs`, `network-causality.json`, capturas, resultado y manifiesto.
Build: `GHPTlpI0jcGGEc3YV72WJ`; manifiesto Next:
`6e3c8481152f22b494e9a67a24e250450ee6554c883a48753daf866af9b85e39`.
SHA256 de `manifest.sha256.json`:
`7c6062c4ab81f83e132b8c03703d3284a55fc372462d6506f5043e6c85b96396`.
Los 49 artefactos se copiaron fuera del worktree y se verificaron contra ese
manifiesto, con cero discrepancias.

Para repetir el diagnóstico se necesita una fixture propia, un build/start
local nuevo y una ruta nueva de evidencia. Registrar los indicadores al
iniciar la petición y la fase cuando se cancela permite distinguir prefetch
explícito y cierre observado de una petición funcional fallida. Una cancelación
sin esa evidencia debe seguir fallando el gate; no ignorar globalmente
`net::ERR_ABORTED`. No se ha cambiado el producto ni relajado los specs de CI.

La [issue #1301](https://github.com/borjar20/Biblioshare/issues/1301) sigue
abierta por la clasificación pendiente de los cinco eventos históricos:
el registro original no contiene los datos necesarios para confirmarla.
