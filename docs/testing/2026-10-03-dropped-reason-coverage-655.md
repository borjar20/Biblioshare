# Motivo de abandono en el diario: cobertura DOM (#655)

> **[Canónico · verificado contra código y Vitest/jsdom el 2026-10-03]**

[Ticket #655](https://github.com/borjar20/Biblioshare/issues/655): faltaba una
defensa automatizada del motivo de abandono en modo lectura. La implementación
ya cumple el contrato; este cambio añade tests sin modificar el producto,
los mensajes ni los exports. Base de ejecución:
`14ad944ed48302c9f36a4165f6e8cf19d19bcdaa`.

## Superficie real y casos ejecutados

[`pass-diary.dropped-reason.test.tsx`](../../src/components/detail/pass-diary.dropped-reason.test.tsx)
renderiza la interfaz pública `PassDiary`. Su `PassCard` privado y todos los
componentes de presentación y hooks se ejecutan realmente. El provider es
`NextIntlClientProvider`, con `locale="es"`, zona horaria fija `UTC` y
[`messages/es.json`](../../messages/es.json) real; no se sustituye `t()`.

Las aserciones se limitan a la tarjeta `diary-entry` y comprueban que su
formulario de edición está desmontado. El fixture no tiene edición asociada,
de modo que el único chip posible es el motivo de abandono.

| Caso | Resultado observado |
|---|---|
| `dropped`, `no_enganchado` | Chip «No enganchó» |
| `dropped`, `aburrido` | Chip «Me aburrió» |
| `dropped`, `no_es_momento` | Chip «No es el momento (lo retomaré)» |
| `dropped`, `no_esperado` | Chip «No era lo que esperaba» |
| `dropped`, `otro` | Chip «Otro» |
| `dropped`, `otro` y nota larga | Chip y párrafo con la nota completa, incluida su frase final; sin clases `truncate`/`line-clamp-*` |
| `dropped`, motivo `null` | Ningún chip ni etiqueta de motivo |
| `completed`, `otro` y nota residuales | Ningún chip ni nota de abandono |

Son **ocho casos nuevos, ocho PASS**. La tanda focal posterior a los controles
incluye estos ocho y los 27 existentes de `src/lib/passes/actions.test.ts` y
`src/lib/passes/get-passes.test.ts`: **tres archivos, 35 PASS**. El mensaje
`notifyPublicReviewMentions failed { message: 'lookup failed' }` corresponde al
caso existente que simula un fallo de resolución; ese caso pasa.

## Frontera y dobles

Tres módulos de acciones se sustituyen porque importan Supabase y APIs de
servidor: `passes/actions`, `social/mention-search` y
`social/joint-viewing-actions`. En `completed`, la carga conjunta devuelve un
mapa vacío y se espera su resolución antes de inspeccionar el DOM. El resto de
las acciones debe permanecer sin llamadas; `afterEach` lo comprueba. `fetch`
lanza si se usa y también debe conservar cero llamadas. No se sustituyen el
router, la media, Intl ni las tarjetas.

Esto acredita el texto y los gates del **DOM local en jsdom**. No acredita
layout CSS en un navegador real, RSC/streaming de Next, privacidad/RLS,
persistencia, edición/guardado ni dispositivos. No se arrancaron servicios,
no se usó navegador ni DB y no se cargaron credenciales.

## Controles negativos mínimos

Se aplicaron dos cambios temporales independientes a
[`pass-diary.tsx`](../../src/components/detail/pass-diary.tsx) y se ejecutó un
caso seleccionado por control. Los siete restantes quedaron `SKIPPED`; no
se cuentan como casos ejecutados de esos controles.

| Control temporal | Caso seleccionado | Resultado causal |
|---|---|---|
| Quitar `pass.status === "dropped"` del gate del chip | `completed con motivo y nota residuales` | **1 FAIL**, exit 1: aparece el chip que debía estar ausente |
| Renderizar `pass.droppedReasonNote.slice(0, 120)` | `nota larga completa sin truncar` | **1 FAIL**, exit 1: falta el texto completo esperado |

Tras cada control se restauró el archivo con sus bytes originales. SHA-256
de producto antes y después:
`B8A1AA3B0827F83028D172935030CCA347687D6CE698CC1D2C145DF14CE4F8D6`.
Los dos FAIL son controles de sensibilidad de los tests, no fallos del
producto restaurado. La tanda focal final de 35 casos pasa sobre ese producto.

## Comandos y evidencia

Runtime ejecutado: **Node v24.19.0**. Se usó el ejecutable explícito porque el
Node del PATH no es el admitido por este proyecto.

```powershell
$taskNode = 'C:\Users\jasc9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $taskNode node_modules/vitest/vitest.mjs run src/components/detail/pass-diary.dropped-reason.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose
& $taskNode node_modules/vitest/vitest.mjs run src/components/detail/pass-diary.dropped-reason.test.tsx src/lib/passes/actions.test.ts src/lib/passes/get-passes.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
& $taskNode node_modules/eslint/bin/eslint.js src/components/detail/pass-diary.dropped-reason.test.tsx
& $taskNode node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

Vitest, ESLint, TypeScript y whitespace: **PASS**. Los controles usan la misma
invocación de Vitest, con `-t` y el nombre focal indicado arriba.

La evidencia nueva reside exclusivamente en el directorio raíz no versionado:

```text
C:\Users\jasc9\Documents\Proyectos-Codex\Biblioshare\.scratch\ticket-campaign\20261002-resolve-all\dropped-reason655-20261003
```

`baseline-vitest.log` y `focal-final-vitest.log` conservan las ejecuciones;
`status-gate-vitest.log` y `note-slice120-vitest.log`, los FAIL causales.
`negative-controls.ps1` aplica y restaura los dos cambios, y
`negative-controls.json` registra selección, códigos y hashes.
`verification-receipt.json` registra fuentes, archivos propios y checks.
No se repiten ni se atribuyen a esta ejecución campañas históricas.

La integración requiere los checks de CI de la PR sobre su HEAD final. Este
informe local no acredita por sí solo ese gate remoto.
