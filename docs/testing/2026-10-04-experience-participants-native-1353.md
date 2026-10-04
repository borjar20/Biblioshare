# Experiencias: acompañantes relativos a quien mira — QA nativa #1353

> **[Informe de QA local · verificado el 2026-10-04 contra el candidato
> `565c2f986d17a128f2ca0401e6fb97af468e4506`; no acredita un despliegue]**

**PASS focal: 27/27 comprobaciones en Chromium real, contra una build nueva y
`next start` del producto.** B y C ven al organizador entre sus acompañantes en
detalle, hub y perfil. El feed conserva al organizador en su cabecera y lista
sus acompañantes, incluido B cuando B mira la publicación.

Issue: [#1353](https://github.com/borjar20/Biblioshare/issues/1353).
El informe de implementación separado permanece en
`docs/testing/2026-10-04-experience-participants-1353.md`.

La evidencia local está en el **repositorio raíz**, fuera del worktree y de Git:
`.scratch/ticket-campaign/20261002-resolve-all/experience-participants1353-native-20261004/`.
La pasada focal completa es `run04-persistence-barriers/`. Los FAIL anteriores
se conservan en sus propias rutas y no se suman a los 27 casos.

## Entorno y frontera de la prueba

- Worktree: `.claude/worktrees/push1052`, HEAD `565c2f986d17a128f2ca0401e6fb97af468e4506`;
  padre `eee8b8c63a7758597f32547b224c415177ae5680`.
- Node **24.19.0**, ejecutable explícito del runtime de Codex. Next **16.3.8**,
  **Turbopack**, Chromium **149.0.7827.55** headless, ventanas de 1280×900 y 390×844.
- Build nueva: `ELIrgcVGP9H5GFPMu4UzJ`, exit 0 en **40.668 ms**.
  Arranque real en `http://127.0.0.1:3000`; no se sirvió una fixture de componentes.
- Único backend: Supabase local `biblioshare-local-eeaa203e`, API 54321/DB 54322.
  Root había ejecutado el verificador SQL real actual: PASS, 285 pasos, RLS,
  permisos y carreras. Este agente no repitió SQL, no hizo DDL y no creó otro stack.
  Recibo previo: `celebrations1334-resume-20261004/main-integration-postgres-01.log`.
- Preloader privado declarado: bloquea lecturas de `.env`, amplía sólo
  `turbopack.root` y `outputFileTracingRoot` para la junction existente de
  dependencias y registra metadatos de `fetch` delegando en el original.
  Aliases, fuentes, respuestas, Auth, RLS y configuración del producto permanecen
  intactos. No hay interceptaciones de respuestas del navegador ni timers simulados.
- Se verificaron **1.795 hashes de fuentes/dependencias declaradas sin cambios**.
  No se repitieron unitarios, lint ni gates de otros responsables.

Los actores A/B/C son organizador e invitados aceptados. La creación, búsqueda de
cuentas, invitaciones, aceptación, consentimiento individual, cambio a audiencia
de perfil, seguimiento B→A y publicación se hicieron mediante controles reales
de la app. Las filas se comprobaron por REST local y las vistas se recargaron.
A había marcado «Vivida»; B/C aún tenían presencia «Por confirmar»: aceptación
de la invitación y asistencia siguen siendo estados distintos.

Las dos experiencias adicionales de estados y privacidad se sembraron por REST
con IDs propios. Su lectura y render en el navegador usan rutas, consultas y RLS
reales. No se presenta esa preparación como prueba del flujo UI de rechazo o de
alta de un invitado sin cuenta. El último cambio de audiencia a `participants`
también es una modificación de fixture local, seguida de lecturas reales.

## Resultado observado

| Superficie | Casos | Estado | Literal o frontera observada tras recargar |
|---|---:|---|---|
| Detalle, hub y perfil propio de A/B/C | 9 | PASS | A: `Con Invitada Berta, Invitado Carlos`; B: `Con Organizador Alba, Invitado Carlos`; C: `Con Organizador Alba, Invitada Berta` |
| B en el perfil del organizador, 390 px | 1 | PASS | `Con Organizador Alba, Invitado Carlos` |
| Anónimo: detalle, perfil y frontera del hub | 3 | PASS | Audiencia `profile` con consentimiento: `Con Organizador Alba, Invitada Berta, Invitado Carlos`; hub redirige al login |
| Publicación para A/B/anónimo e Inicio de B | 4 | PASS | Cabecera actor `Organizador Alba`; `Con Invitada Berta, Invitado Carlos`, conservando al viewer B |
| Pendiente, rechazada e invitado sin cuenta | 5 | PASS | A/B en detalle y hub conservan `Invitado sin cuenta`; `Pendiente Paula` y `Rechazado Ramón` quedan fuera de «Con». Anónimo sólo recibe A/B por RLS |
| Identidad con perfil privado | 3 | PASS | B aceptada ve a Diana y A; anónimo en detalle/perfil recibe sólo A/B aunque Diana haya consentido |
| Audiencia actual tras haber visitado la vista pública | 2 | PASS | Anónimo recibe 404 y pierde la tarjeta pública; B aceptada sigue viendo `Con Organizador Alba, Invitado Carlos` |

Los textos se comprobaron dentro de la cabecera o tarjeta correspondiente. La
aserción compara el conjunto de nombres aceptados y guarda el literal observado;
no convierte el orden de una consulta sin contrato de ordenación en un requisito.
Por ejemplo, el caso privado de B produjo `Con Protegida Diana, Organizador Alba`.

**LIMIT de identidad protegida:** RLS elimina la fila externa de la acompañante
privada. No se fabricó un DTO con identidad nula para hacer aparecer el fallback
«Acompañante» en una ruta a la que el backend real no llegó. Este informe acredita
la ocultación real, no ese fallback sintético ni todos los escenarios de bloqueos.

## Auth, red y cohortes incidentales

**PASS de ausencia de Auth añadido por #1353:** el diff contra el padre sólo
transporta el `viewerId` ya disponible y calcula nombres. `queries.ts`, los
clientes Supabase y `participant-actions.ts` conservan sus blobs. Las líneas
añadidas no introducen llamadas Auth, clientes ni `fetch`.

El censo registra la red existente: las cohortes de navegación y recarga de rutas
autenticadas principales tienen cuatro GET a `/auth/v1/user`; las cohortes
anónimas focales tienen cero. Son totales con shell, background y prefetch,
**no una medición A/B de rendimiento anterior/posterior**. El delta cero se
atribuye al diff; no se afirma que la app no haga consultas Auth existentes.
Recibo: `auth-no-extra-calls-final.json`.

De **2.602 peticiones** de navegador, hay cero errores de página. El único error
HTTP y de consola es el **404 esperado** al retirar el acceso anónimo. Se conservan
**294 `net::ERR_ABORTED`** de streams/prefetch; no se declara una red global limpia
ni se supone que todos sean inocuos.

La cohorte preexistente `pullPendingCelebrations` queda separada por el índice
real de acciones de esta build: **67 POST HTTP 200, 30 abortados**. Los otros
**16 POST funcionales** responden 200 y **11** registran aborto del stream; el
estado de esas acciones se comprobó además por backend/UI. HTTP 200 aislado no
acredita finalización del stream ni efectos causales. No se infiere de esta
cohorte una aceptación de #1334 ni una auditoría de #1301.
Detalle conservado: `request-cohorts-final.json` y `network-*.json` de la pasada.
El servidor sólo emitió el aviso de `metadataBase`, sin error inesperado.

## Fallos preservados y capturas inspeccionadas

| Pasada | Resultado | Causa acotada y corrección del entorno/driver |
|---|---|---|
| `run01-native` | FAIL preparación | Next recibió sólo key pública; la invitación confirmaba RPC pero no podía construir el cliente de notificaciones. Root autorizó después la service key local sólo en RAM del servidor. No se atribuye a un bug de #1353 ni se modificó `notify()` |
| `run02-complete-runtime` | FAIL sincronización | `Playwright.check()` exigía actualización inmediata de una casilla controlada asíncrona. El driver pasó a click, persistencia real y casilla checked/enabled |
| `run03-checkbox-sync` | FAIL sincronización | Esperar ausencia del botón por nombre confundía «Guardando» con finalización. Se exigió audiencia persistida y botón de publicación habilitado antes de cerrar |
| `run04-persistence-barriers` | PASS 27/27 | Mismo HEAD y build, sin ampliar timeouts ni cambiar fuentes |

Se inspeccionaron realmente con `view_image` las seis capturas focales siguientes
y las tres capturas principales de diagnóstico de los FAIL. Los hashes completos
y observaciones están en `visual-review-final.json`.

| Captura de la pasada focal | SHA-256 |
|---|---|
| `b-detail-desktop.png` | `a9576c609a5c5a9e4ef118c1644927b922ea24847f111f8d9dbf07b34f4757ca` |
| `b-organizer-profile-mobile.png` | `d9f96eaeedebbbad31ead850856c66ace3e352c686ff9f1f70155dd18040e479` |
| `b-feed-mobile.png` | `37bccadb9682a6e0cd3e9eaf3e7ba9c698c92e0749b048b692ff9aa945ee7311` |
| `anonymous-detail-desktop.png` | `b387b95b6b096e4b369c5a1fd37b7bd7403b4ef21693c6b3ce72d0f62312c03b` |
| `states-organizer-desktop.png` | `e3bd8a3e50df5ae651d326af4f6cf2b53464d9d5d2a4af29758a5754559061a2` |
| `protected-anonymous-desktop.png` | `10c81fbe39693468084e81a7df1f75aef63a5d93c2ad7a4369f5aca61edcc9cb` |

Los nombres «Con…» son legibles y el desbordamiento horizontal medido es **0 px**
en las vistas de 1280/390 px. Las capturas móviles de página completa incluyen
la navegación inferior fija cruzando el lienzo; en la del perfil tapa parte del
título. Esto limita la lectura de esa captura y no acredita un layout global sin
oclusiones, otros motores, accesibilidad exhaustiva ni aprobación artística.

## Credenciales, limpieza y recibos

CLI local fijada por Root: 2.116.0. Su `status` se capturó sólo en RAM. No se
leyó/copió/escribió `.env` ni se persistieron passwords, cookies, storageState o
traces. La build no recibió service key. Root autorizó después
`SUPABASE_SERVICE_ROLE_KEY` exclusivamente en RAM del backend Next, sin prefijo
público. La key no aparece en **126 archivos cliente** escaneados ni en los
**66 artefactos de ejecución** comprobados por sus bytes exactos. Ninguna captura
inspeccionada muestra credenciales. Recibos `credential-boundary.json` y
`credential-artifact-scan.json` de la pasada.

**Limpieza PASS en las cuatro pasadas:** los seis actores propios de cada una
terminaron en Auth 404 y siete superficies por actor a cero (`profiles`,
`passes`, participantes/experiencias, posts, notificaciones y celebraciones).
En la pasada focal también quedaron las tres experiencias, sus seis superficies
hijas y la publicación a cero. Se cerraron los contextos, Chromium y el único
Next propio. Puerto 3000 libre y cero Node propios en la comprobación posterior.
El Supabase compartido quedó funcionando para Root. No se tocó `devtest`,
`codex_qa`, catálogo ajeno ni cuentas persistentes.

| Recibo | SHA-256 |
|---|---|
| `run04-persistence-barriers/result.json` | `c45343cd222eeeb6adc5718bae0a162400773923a45dabc762c17a3e47f3c1cf` |
| `build.stdout.log` | `8ef67e3525ffcf62eefe42f9ba55d1b6849827ad9a9cfa0be156ace579271c47` |
| `execution-receipt-final.json` | `2bceadaec07a65f6b86b61e6e8d53791fedb1e74d313d43081c1b74e0701f4fd` |

El manifiesto final vincula también fuentes, preparación, red, capturas y
recibos de limpieza. Root integra este informe: el agente QA no hizo commits,
push, escrituras GitHub, cambios canónicos, DDL ni modificaciones de producto.
