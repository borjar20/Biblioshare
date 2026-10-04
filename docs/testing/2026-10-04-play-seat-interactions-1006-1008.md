# Fichas de acompañantes y asientos de MTG — #1006/#1008

[Histórico · congelado 2026-10-04]

**PASS: 8/8 E2E naturales** contra build/start reales, a 390 × 844 y
1280 × 720 px. Dos casos cubren [#1006](https://github.com/borjar20/Biblioshare/issues/1006)
y seis [#1008](https://github.com/borjar20/Biblioshare/issues/1008).
El cambio añade exclusivamente
[un spec CI](../../e2e/ci/play-seat-interactions.spec.ts) y este informe.
No se modificó producto, copy, esquema, dependencias ni configuración fuente.

## #1006: tocar abre; quitar vive en el panel

Se sientan Ana y Beto mediante «Añadir jugador», el campo «Nombre del jugador»
y Enter. Se comprueba que el registro propio `anon:resources` ya contiene
ambos jugadores. Tocar «Editar a Ana» abre el panel con su nombre y
«Quitar a Ana de la mesa», conservando las dos fichas y el registro IndexedDB
completo. Cerrar y reabrir la ficha tampoco cambia ese registro.

Al pulsar «Quitar a Ana de la mesa», desaparecen Ana y su panel; Beto conserva
su ficha. Se comprueba la escritura nativa con una revisión posterior y,
tras recargar, la única ficha es Beto y el registro coincide con el resultado
persistido. **PASS 2/2**, uno por ancho.

Esto distingue tocar-para-quitar, un botón de retirada que no actúa, quitar a
la persona equivocada y una eliminación sólo en memoria. Sigue la decisión
«La ficha de asiento se toca para abrir, nunca para quitar» del 2026-09-01.
No se alteró código para ensayar mutantes.

## #1008: añadir/quitar y arrancar con identidades válidas

| Recorrido por ancho | Comprobación que ejecuta el navegador | Resultado |
| --- | --- | --- |
| Cuatro → quinto → cuatro | «Añadir jugador» crea «Editar a Jugador 5»; se cierra el panel automático y se reabre tocando su ficha. «Quitar asiento» deja cuatro fichas. Arrancan en `/partida/activa`, con 40 vidas y `p1,p2,p3,p4`, y sobreviven a recarga | PASS 2/2 |
| Retirada intermedia → alta nueva | Ana/Beto/Cris/Dani + Eva; se elige que empiece Eva, se quita Beto y se añade Fede. Arranca la mesa Ana/Cris/Dani/Eva/Fede, con ids `p1,p3,p4,p5,p2`, todos únicos; Eva sigue empezando (`startingSeat=3`) | PASS 2/2 |
| Mínimo y Duelo | Quitar el cuarto y el tercero deja dos. El panel del segundo conserva «Quitar asiento» deshabilitado. En Duelo se abre un panel real, pero no hay «Quitar asiento» ni «Añadir jugador»; arranca un tablero de dos con 20 vidas e ids `p1,p2` | PASS 2/2 |

Los oráculos combinan controles y tablero visibles con el `game_started`
persistido en IndexedDB, leído mediante el helper existente `play-db.ts`.
No se importa `setup-draft`, el reducer ni otro código de producto desde los
tests. Los nombres, orden, modo, vidas, asiento inicial e ids se verifican
sobre la salida real; también se comprueba unicidad de los ids de comandantes.
La retirada intermedia es necesaria: añadir sólo después de quitar el último
no distinguiría una implementación que calcule el nuevo id por longitud.

## Integración de cobertura y preparación local

El spec vive en `e2e/ci/`, descubierto automáticamente por
`playwright.ci.config.ts` y el job `critical-flows` existente. No se modificó
el workflow ni el runner CI. Se usan nombres accesibles exactos para actuar,
el único `main` visible y paneles/controles filtrados por visibilidad.
La ambigüedad de dos controles visibles sigue fallando; no hay `first`, `nth`,
esperas fijas, aumento de tiempos ni allowlist de errores. Los grupos de fichas
y acciones del tablero se cuentan para detectar ausencias o duplicados,
respetando las rutas ocultas que conserva Cache Components (#1003).

La ejecución local fue una build nueva de
`c4279b09b8d6f210666b8fcdb0c22935b3976b9a`, rama
`codex/play-seat-interactions-1006-1008`, con Node **24.19.0**, Next **16.3.8**
y **Turbopack**. Build: 41,302 s; TypeScript: 25,039 s; ESLint: 2,515 s.
Playwright: **8 PASS, 0 FAIL, 0 skip, 0 flaky, 0 retries**, reporter 11,913 s
(proceso 12,583 s), un worker y tiempos CI originales de 60 s/15 s.

Se ejecutó el mismo fichero durable, sin copia alterada. La configuración
privada sólo seleccionó ese spec, cambió las rutas/reporters, reutilizó el
único servidor 3000 que gestionaba el supervisor y desactivó trace para
evitar persistir claves locales. No hubo mocks de producto, API ni proveedores.
Los ocho contextos eran anónimos; no se necesitó crear actores Auth o filas
remotas. Cada contexto posee su IndexedDB y se destruye al terminar el caso.

Se usó el stack existente `biblioshare-local-eeaa203e`, API 54321, mediante
`SUPABASE_LOCAL_WORKDIR` explícito:

```text
.scratch/ticket-campaign/20261002-resolve-all/celebrations1334-bootstrap-local-r2-20261003
```

Root había acreditado previamente sus 285 pasos SQL; esta QA no los repitió.
El CLI local 2.116.0 entregó sus claves sólo a RAM. No se leyó/copió/escribió
`.env`; la service key no pasó a build ni a `NEXT_PUBLIC_*`. El preloader
privado negó lecturas de `.env` y ajustó únicamente `turbopack.root` y
`outputFileTracingRoot` en RAM para la junction existente, con aliases
idénticos y configuración fuente intacta.

Comando ejecutado desde `coverage1307`, con el workdir local anterior en el
entorno del proceso:

```powershell
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' 'C:/Users/jasc9/Documents/Proyectos-Codex/Biblioshare/.scratch/ticket-campaign/20261002-resolve-all/play-seat-interactions1006-1008-20261004/run.mjs' run02-natural
```

El supervisor ejecutó `eslint e2e/ci/play-seat-interactions.spec.ts`,
`next build`, `tsc --noEmit --incremental false`,
`next start --hostname 127.0.0.1 --port 3000` y el CLI Playwright con
`run02-natural/native.config.ts`, utilizando ese mismo Node explícito.

La `.next` anterior de #1369 se preservó mediante rename, tras verificar
ambos absolutos dentro de `coverage1307` y que el origen no era un enlace,
sin recorrer `node_modules`:

```text
.claude/worktrees/coverage1307/.scratch/play-seat-interactions1006-1008/previous-next-1791140194413
BUILD_ID anterior: 8sxvNW_X867i_zZrkoS3w
```

## Salud, FAIL preservados y límites

Los ocho casos mantienen aserciones estrictas de `pageerror`, `console.error`
y respuestas HTTP ≥400: **cero en las tres superficies**. El servidor no
registra los errores de render tardío comprobados por el runner CI. Se
preservan **23 `net::ERR_ABORTED`**, repartidos por caso 4/3/3/1/4/2/2/4;
no se convierte ese dato en un PASS global de red ni se silencian eventos.

`run01-natural` conserva un **FAIL de preparación, antes de build o navegador**:
lint clasificó el callback Playwright llamado `use` como hook React dentro
del `try/finally`. Se renombró a `runTest`, manteniendo las aserciones de salud;
`run02-natural` es una ejecución nueva. El primer intento no movió `.next`,
no creó actores y no acredita ningún recorrido. No fue un bug de producto.

También se conserva un **FAIL del analizador**, posterior al PASS nativo:
contó el PID 29120, ya reutilizado por Windows para `backgroundTaskHost`,
como si siguiera siendo el Node de la build. Se corrigió la auditoría para
validar identidad de proceso y separar PIDs reutilizados. No se detuvo ese
proceso ajeno, no se reejecutaron los E2E y no cambió el driver ni su salud.

Las diez capturas se abrieron e inspeccionaron con `view_image`: panel de Ana,
Beto solo tras recarga, quinto asiento abierto, tablero de cinco con el turno
de Eva y retirada deshabilitada con dos, en ambos anchos. Sus hashes y tamaños
están en `native-analysis.json`; el recibo es `visual-inspection.json`.
Duelo se acredita por DOM/tablero, sin captura específica. La revisión de estas
imágenes es funcional, no una auditoría de diseño o de toda la app.

Se verifica Chromium en estos dos tamaños y estos contextos anónimos. No se
afirma PASS de Firefox/WebKit, jugadores habituales autenticados, sincronización
remota, toda la suite o CI remoto. Root coordina revisión, integración y CI.

## Limpieza y evidencia

Los contextos y navegador propios terminaron; cero procesos Node propios y
headless restantes, y cero listeners de 3000 a **2026-10-04T19:03:33.6791307Z**.
No se creó ni modificó `codex_qa`. Supabase/Docker se dejó funcionando para Root.
Las dos builds y la evidencia anterior se conservan. El escaneo encuentra
**0 presencias de service key en `.next`/evidencia** y **0 claves en evidencia**.
Un inventario de **1945 fuentes**, incluido el spec, coincide antes/después.

Evidencia propia:

```text
.scratch/ticket-campaign/20261002-resolve-all/play-seat-interactions1006-1008-20261004/
```

| Identidad | Valor |
| --- | --- |
| Base de build | `c4279b09b8d6f210666b8fcdb0c22935b3976b9a` |
| Spec ejecutado SHA256 | `01c6570160879e6facc5baaca73d069a20b85060639924177f2b7ac4eccf429d` |
| BUILD_ID | `gAFpLYBiA1n3jeY5tQfFf` |
| Fichero BUILD_ID SHA256 | `ff43f341f3d45a22c728f6f44e8a4d38c3af7368754d3f38385b6bac21fefddb` |
| Inventario de 2475 artefactos de build, excluye `.next/cache/**` | `47ca7d41abbbea88e703356ee5e0b1368c5bd70c774c8e671a885fa793233134` |
| Inventario de fuentes SHA256 | `33193c621aacfa6647cafa64d0fe20617c56b0e9f070212f8dca6be3bcb0b7c2` |

Recibos: `run02-natural/execution-receipt.json`, `native-analysis.json`,
`hash-receipt.json`, `process-cleanup-final.json`, `visual-inspection.json`,
`preparation-failure-classification.json` y `analysis-failure-binding.json`.
El manifiesto final contiene sólo scratch propio y copias congeladas del spec
y de este informe, sin archivos vivos de Root. El commit local de entrega se
vincula por separado en el handoff; no hubo push, PR o escritura GitHub desde
este agente. Los canónicos pertenecen a Root.
