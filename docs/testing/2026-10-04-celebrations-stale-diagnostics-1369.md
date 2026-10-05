# Celebraciones: diagnóstico de claim obsoleto (#1369)

> **[Candidato local · verificado el 2026-10-04 sobre la base cc9c565;
> revisión independiente, navegador y CI de entrega pendientes]**

El consumidor conserva el diagnóstico de una llamada vigente que responde
`unavailable` o rechaza. Tras un cambio de identidad, generación o montaje,
consume su resultado sin registrar el error como si perteneciera al contexto
actual. Son dos guardas en `src/lib/celebrations/consumer.ts`; no cambian SQL,
grants, ACK, release, leases, presentación ni las aserciones de salud del E2E.

## Evidencia que motivó el cambio

El run `37218345996`, HEAD `cc9c565496faf561aa6486e5a8e1558218b230b5`, falla
`detail-notes-streaming` por un aviso `claim/unavailable`. La traza registra
la primera salida de portada a `/libro` a 34673.226 ms, un POST de claim a
34732.561 ms con status -1/`net::ERR_ABORTED`, y el aviso a 34819.061 ms.
El abandono posterior del detalle llega después, a 36121/36399 ms.

Esto acredita cancelación de transporte y un diagnóstico cliente. No acredita
una RPC fallida, un ACK ni una pérdida de celebración. La generación efectiva
del callback no está instrumentada en esa traza: la comprobación nativa del
HEAD final debe confirmar si estas guardas cubren esa cancelación concreta.
Los otros seis fallos de formularios se siguen por separado en #1368.

## Pruebas causales y resultado

Los diez casos nuevos ejecutan la clase real con una promesa de claim retenida
en su frontera de acciones. Para resultado `unavailable` y rechazo comprueban:

- La llamada vigente mantiene exactamente un diagnóstico.
- A→B continúa solicitando para B sin diagnosticar el resultado anterior.
- A→B→A distingue generaciones aunque la identidad vuelva a ser A.
- Stop observa el resultado/rechazo sin diagnosticarlo ni pedir otro claim.
- Stop/start con la misma identidad continúa el nuevo montaje sin confundirlo
  con la llamada previa. Ninguno de estos fallos produce un ACK.

Con la fuente original Git y la fixture final tipada: **RED, 8 FAIL/2 PASS**.
Con las dos guardas: **GREEN, 85/85 tests en cinco archivos**, incluidos los
75 existentes de acciones, registro, proveedor y overlay. TypeScript completo
y ESLint focal PASS. La suite determinista no acredita Auth, PostgreSQL/RLS,
HTTP, un ciclo React nativo ni todas las cancelaciones de navegación.

Se conserva el primer FAIL de tipos: a la fixture `empty` le faltaba `actorId`.
Se corrigió únicamente la fixture para devolver la identidad solicitada. Los
checks finales usan ese contrato completo, sin debilitar los controles vigentes.

## Repetición y conservación

Node explícito **24.19.0**. Checks ejecutados desde `.claude/worktrees/coverage1307`:

```text
node node_modules/vitest/vitest.mjs run src/lib/celebrations src/components/celebrations --maxWorkers=1 --no-file-parallelism --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/celebrations/consumer.ts src/lib/celebrations/consumer-stale-diagnostics.test.ts
git diff --check
```

Artefactos propios en el repo raíz:
`.scratch/ticket-campaign/20261002-resolve-all/celebrations-stale-diagnostics1369-20261004/`.
La fuente restaurada conserva su SHA-256 `c43d6acbf15201bd288a4591bdd1e1bfdf5429d8448191454a4822bf598924ab`.

| Recibo | SHA-256 |
|---|---|
| `red-final-02.log` | `c7eb41574c20a9db0bec458902bf438184fe36443bf22420f9b6e180ece8952a` |
| `red-final-02.json` | `ce79f63aed55f2dd21f78405e5e69c8e9be3e5f9330df20a03ffef4396a83da4` |
| `green-regression-02.log` | `d56b63e6cd257a15043a68c07407cac46f07c45e687ddb837598b9b71ec8cfab` |
| `types-02.log`, `lint-02.log` (vacíos, exit 0) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

La reproducción RED usa el blob Git original sólo en el archivo propio y lo
restaura en `finally`, verificando bytes exactos. No se sobrescriben los FAIL
anteriores ni se ejecutan servicios, DDL o escrituras remotas en esta tanda.
