# Notificaciones y cabecera móvil — verificación del 2026-10-04

> **[Canónico · verificación local de navegador contra build de producción el 2026-10-04]**
> Acredita esta corrección de geometría y sus interacciones; no acredita un despliegue ni una auditoría global de red.

## Resultado y entorno

**7/7 recorridos funcionales PASS**, 19,708 s, un worker Chromium, cero reintentos,
SKIP o flaky. Cinco casos nuevos de
[`header-notifications-mobile.spec.ts`](../../e2e/header-notifications-mobile.spec.ts)
y los dos casos existentes del avatar de
[`ia-navegacion.spec.ts`](../../e2e/ia-navegacion.spec.ts).

Checks finales de la misma corrección, ejecutados por el coordinador:
**suite general PASS: 459 archivos, 4565 tests, 233,52 s**; **17 unitarios
focales PASS**; **lint final PASS** y **`npm run build` PASS** (79 páginas).
Estos checks complementan la comprobación de navegador; no clasifican los
abortos de red registrados abajo.

Servidor local `next start` en `http://localhost:3000`, Next 16.3.8, Node 22.23.1.
Build ID: `24zu9LOYAPtxL7lZm-O76`; base Git al medir: `d42e92c5` más los cambios
locales de esta corrección. Inicio registrado: `2026-10-03T22:26:10.175Z`
(2026-10-04 en Europe/Madrid). Las credenciales se cargaron desde `.env.local`
sin incorporarlas a la salida ni a trazas.

El diagnóstico inicial del 2026-10-03 midió recorte real. Antes de modificar el
panel, el caso durable a 320 px volvió a fallar por la causa esperada:
`borde izquierdo >= 16`, recibido **−120 px**. No se relajó esa aserción.

## Geometría medida

Panel real cargado en **estado vacío** (`rows = 0`) antes de medir cada ancho,
en claro y oscuro. Ambos temas dieron los mismos valores:

| Viewport | Izquierda antes | Izquierda ahora | Derecha ahora | Ancho | Y | Alto |
|---:|---:|---:|---:|---:|---:|---:|
| 320 | −120 | 16 | 304 | 288 | 66 | 228 |
| 360 | −112 | 24 | 344 | 320 | 66 | 228 |
| 390 | −82 | 54 | 374 | 320 | 66 | 228 |
| 412 | −60 | 76 | 396 | 320 | 66 | 228 |
| 768 | 288 | 276 | 596 | 320 | 59 | 228 |

Unidades: píxeles CSS; altura del viewport: 844 px. La cabecera midió 59 px de
alto. El panel empieza debajo de ella, conserva al menos 16 px a cada lateral,
y el documento no desborda horizontalmente. La marca no se solapa con la
campana; su objetivo táctil mide al menos 44×44 px en todos esos casos.

## Interacciones y ventana baja

- A 390 px, el perfil conserva su enlace directo. Tema está en Más, al final
  de sus opciones: ArrowUp lo enfoca, Enter cambia el tema y cierra el menú.
  Escape cierra y devuelve el foco a Más. Al pasar a 768 px, el control de tema
  de escritorio es visible y las flechas saltan la fila oculta del menú.
- La campana cierra con Escape y devuelve el foco al botón. Un clic fuera del
  panel también lo cierra. El estado real cargado sigue dentro del viewport
  a 320×360 px.
- El caso de lista larga mantiene login, chrome, componentes y CSS reales.
  Identifica únicamente `fetchNotifications` en el manifest de producción,
  retiene su respuesta para comprobar `aria-busy`, y sustituye sólo su array
  de retorno por 20 avisos sintéticos. **No inserta filas en Supabase.**
  A 320×360 px, el panel tiene `clientHeight = 203` y `scrollHeight = 1690`;
  al recorrer su scroll exterior se llega al último aviso y al pie. Las cadenas
  largas sin espacios no provocan desbordamiento horizontal.

**Límite visual observado:** en la captura del final de la lista a 320×360 px,
la mascota flotante tapa parte derecha del texto del pie de push. Los bordes y
el scroll pasan; eso no demuestra que el pie quede libre de superposiciones.
Seguimiento separado: [issue #1350](https://github.com/borjar20/Biblioshare/issues/1350). La evidencia acredita superposición visual, no interceptación de clics.
No se modificó la mascota ni se solicitaron permisos de push.

## Fallo de desarrollo conservado

La primera tanda de los dos casos existentes del avatar dio FAIL a 390 px y
PASS a 768 px. A 390 px el `href` era correcto, pero la URL seguía en `/` al
agotarse los 20 s de la aserción. En el mismo intervalo el servidor registró
`Compiling /u/[username]` y `GET /u/devtest 200 in 20.0s`. Esto es una
correlación observada, no un diagnóstico definitivo.

La repetición explícita con la ruta ya cargada pasó a 390 px en 2,8 s; no se
cambió el timeout ni el comportamiento de la prueba. Ambos tamaños pasaron
sobre producción, en 2,014 y 2,028 s. El FAIL inicial no se sustituye por esos
PASS. La primera tanda de los cinco casos nuevos en desarrollo pasó en 16,7 s;
la tanda de producción incluye además las comprobaciones finales de estado
vacío/lista y la precondición de cero avisos sin leer.

## Consola, red y alcance

Los cinco casos nuevos registraron **cero errores de consola o excepciones de
página**. Sus observaciones de red contienen **43 `net::ERR_ABORTED`**, repartidos
entre login, inicio, comunidad, búsqueda, perfil y fichas. La instrumentación
conservó ruta y error, no método ni origen: **quedan sin clasificar**. No se
atribuyen todos a prefetch, ni se afirma inocuidad o pérdida. Los dos casos
existentes del avatar no usan esa instrumentación. El resultado funcional
7/7 y esta limitación de la auditoría de red son conclusiones distintas.

Seguimiento de su clasificación: [issue #1301](https://github.com/borjar20/Biblioshare/issues/1301).
Son observaciones nuevas de esta tanda, pendientes de atribución; enlazarlas
no afirma que tengan la misma causa que los abortos documentados antes.

El servidor de desarrollo también emitió algunos `The destination stream
closed early` y `ECONNRESET`. No se investigaron en este arreglo de geometría.
Seguimiento: [issue #1263](https://github.com/borjar20/Biblioshare/issues/1263),
como observaciones nuevas por clasificar, sin afirmar una causa común con el
incidente que ya recoge esa issue.

## Evidencia local y reproducción

Reporte completo, ignorado por Git:
[`test-results/header-notifications-production-report.json`](../../test-results/header-notifications-production-report.json).
Incluye estado real, bounds, observaciones de navegador y capturas inline.
Exportaciones visuales locales:

- [Panel oscuro a 320 px](../../test-results/header-notifications-production-visuals/notification-dark-320.png).
- [Más en móvil a 390 px](../../test-results/header-notifications-production-visuals/mobile-more-menu-390.png).
- [Carga retenida a 320×360](../../test-results/header-notifications-production-visuals/held-loading-320x360.png).
- [Último aviso y pie a 320×360](../../test-results/header-notifications-production-visuals/long-list-bottom-320x360.png).

La ejecución aislada importó `playwright.config.ts`, desactivó `globalSetup`
y reintentos y dejó las trazas desactivadas. Se reutilizó el servidor de
producción; no se ejecutó la semilla global de sagas. Configuración temporal
(retirada después de verificar):

```ts
import base from "./playwright.config";
export default {
  ...base,
  globalSetup: undefined,
  retries: 0,
  reporter: [["list"], ["json", {
    outputFile: process.env.HEADER_NOTIFICATIONS_REPORT_PATH,
  }]],
  outputDir: process.env.HEADER_NOTIFICATIONS_OUTPUT_DIR,
  use: { ...base.use, trace: "off" },
};
```

Comando ejecutado, con ese archivo guardado temporalmente en la raíz:

```powershell
$env:HEADER_NOTIFICATIONS_MANIFEST_PATH = '.next/server/server-reference-manifest.json'
$env:HEADER_NOTIFICATIONS_OUTPUT_DIR = './test-results/header-notifications-production'
$env:HEADER_NOTIFICATIONS_REPORT_PATH = './test-results/header-notifications-production-report.json'
node node_modules/@playwright/test/cli.js test --config .header-notifications.qa.config.ts e2e/header-notifications-mobile.spec.ts e2e/ia-navegacion.spec.ts --grep 'notification|mobile menu|avatar' --workers 1 --retries 0
```

El spec durable también entra en la suite normal. El manifest sólo se usa para
el caso de lista sintética; `HEADER_NOTIFICATIONS_MANIFEST_PATH` selecciona el
de producción cuando también hay uno de desarrollo.

## Limpieza

La tanda final comprobó cero avisos sin leer **antes** de abrir cada campana:
si hubiera llegado un aviso real, fallaría sin modificar su `read_at`. No se
crearon usuarios, catálogo, pases ni notificaciones, ni se cambió la privacidad.
No hay fixtures de base de datos que eliminar. Navegadores cerrados, servidores
de desarrollo y producción detenidos, puerto 3000 libre al terminar.
