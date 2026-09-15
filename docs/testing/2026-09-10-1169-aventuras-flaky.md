# #1169 — el «flaky» de aventuras era el overlay de desarrollo de Next

> **[Canónico · reproducido y corregido el 2026-09-10 · el diagnóstico que llevaba la issue
> era falso, ver abajo]**

## Qué decía la issue y qué pasa de verdad

#1169 registró que `mascota-aventuras.spec.ts` falló una vez «en la aserción *1 aventura
pendiente*» tras cobrar botín, y propuso como hipótesis una carrera entre el `router.refresh()`
de `onDone` y la lectura del recuento.

**No es eso.** El fallo ocurre una línea antes, en el `click`, y lo dice el propio registro de
Playwright:

```text
TimeoutError: locator.click: Timeout 20000ms exceeded.
  - waiting for getByRole('button', { name: 'Campamento', exact: true })
    - element is visible, enabled and stable
    - <nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script>
      subtree intercepts pointer events
```

El overlay de desarrollo de Next se planta abajo a la izquierda y, en cuanto tiene un aviso que
mostrar, **tapa el primer botón de la barra de la mascota**, que es «Campamento». El click no
llega nunca y el test muere a los 20 s. Hoy siempre hay aviso: el `Date.now()` en prerender de
#895 es global.

El recuento de pendientes nunca llegó a leerse. La hipótesis del `router.refresh()` no está
refutada ni confirmada: **no se ejecutó**.

## Por qué parecía intermitente

La rama de victoria y la de derrota **cliquean las dos** «Campamento», pero por caminos
distintos: la de victoria pasa antes por Personaje (`Ver equipo`), y es ahí donde el overlay
queda encima del botón.

Diez pasadas con `--retries=0 --repeat-each=10` contra `next dev`, con el spec instrumentado
para registrar la rama de cada una:

| Rama | Pasadas | Resultado |
|---|---:|---|
| Victoria | 3 | **3 fallos**, los tres en el mismo click |
| Derrota | 7 | 7 correctas |

No es intermitente: **falla siempre que la aventura se gana**. Lo que es aleatorio es ganar. Eso
explica lo observado el 2026-09-09 —«falló una vez y aprobó al reintentar»—: el reintento tomó la
rama de derrota, que no pasa por Personaje.

Sin la instrumentación esto no se ve: un verde no distinguía «no falló» de «no llegó a la rama
sospechosa», y sobre esa ambigüedad se construyó el diagnóstico equivocado. La línea que registra
la rama se queda en el spec.

## El arreglo

`e2e/support/dev-overlay.ts`: un `addInitScript` que oculta `nextjs-portal` durante el spec.

- **No esconde nada del producto.** El portal lo inyecta `next dev`; no existe en el build de
  producción, que es contra lo que corre CI (`playwright.ci.config.ts` levanta `next start` y
  solo ejecuta `e2e/ci/`). Por eso esto nunca se vio en CI: **el spec de aventuras solo corre en
  local**, donde `playwright.config.ts` arranca `npm run dev`.
- **No es `force: true`.** Un click forzado pasaría por encima de cualquier cosa superpuesta,
  incluida una del producto, y convertiría un tapado real en un verde.
- Va como `addInitScript` y no como `addStyleTag` porque el spec recarga y navega.

## Verificación

Dos comprobaciones, porque la primera sola no bastaba.

**1. La suite, diez pasadas más** (mismo comando y entorno: Node 22.23.1, `next dev` en 3000,
Supabase de desarrollo): **10 correctas en 10,4 min**. Pero solo **una** tomó la rama de victoria
—ganar es aleatorio—, así que esto por sí solo prueba poco: una pasada verde donde antes había
tres rojas de tres.

**2. El mecanismo, de forma determinista.** Un spec temporal que va a Personaje con una cuenta
desechable y trata de pulsar «Campamento», con y sin el helper, sin depender de ganar nada:

```text
[1169] click bloqueado: locator.click: Timeout 8000ms exceeded.
[1169] intercepta el portal: true
[1169] helper=false click=BLOQUEADO
[1169] helper=true  click=OK
```

Sin helper el click no llega y el mensaje de error nombra a `nextjs-portal`; con helper llega. El
spec temporal se borró: su valor era este registro, no quedarse en el repo cubriendo el overlay de
una herramienta de desarrollo.

**Un tropiezo del camino, que vale la pena anotar:** ese spec temporal «inició sesión» sin iniciarla.
`await expect(page).toHaveURL(/\/mascota$/)` da por bueno `…/login?next=/mascota`, porque esa URL
también acaba en `/mascota`. El fallo aparecía después y en otro sitio. **La misma aserción está en
el helper `login()` de `mascota-aventuras.spec.ts`** y en otros specs: hoy no engaña porque el login
funciona, pero el día que falle mentirá igual. Abierto como #1174.

## Lo que esto NO cierra

- **El aviso de dev que hace aparecer el overlay** sigue siendo #895. Este arreglo no lo toca:
  oculta el portal en el spec, no la causa del aviso.
- **Los demás specs de mascota** no llevan el helper. Ninguno ha fallado por esto, pero cualquiera
  que cliquee la barra inferior a viewport estrecho puede toparse con lo mismo; adoptarlo es una
  línea.
- **La hipótesis del `router.refresh()`** queda sin comprobar. Si alguna vez se ve el recuento
  desactualizado tras cobrar botín, es una investigación nueva, no esta.
