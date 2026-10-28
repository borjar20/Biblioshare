# Ficha de saga para el lector, fase 3: evidencia

> **[Evidencia local · 2026-10-28]** Rama `claude/sagas-ficha-fase-3` (apilada sobre
> `claude/sagas-ficha-fase-2`, PR #1555), PR pendiente. Diseño en
> [la spec](../superpowers/specs/2026-10-27-sagas-ficha-lector-design.md); decisiones en
> [`decisiones.md`](../requirements/decisiones.md) (entrada del 2026-10-28, fase 3). Sin migraciones ni
> cambios de esquema. Producción no verificada.

## Qué se entrega

En `/saga/[id]`, a la derecha de «Te toca»: «Entre amigos» (solo con sesión y con alguien que sigues con pases
en las obras de la saga). Por persona: avatar y nombre, «Va por X» / «Terminó X» / «La terminó», barra de
terminadas y nota media. Se ven 4 y el resto, «y N más». Cierra #1540.

## Unitarios

`npx vitest run src/lib/sagas src/components/saga src/app/saga` (Node 22): **58 ficheros, 714 tests, todo
verde**. `npx tsc --noEmit -p .` y `npx eslint` sobre la página y el spec, limpios.

## Comprobación en vivo

`next dev --webpack -p 3000` (puerto libre antes; parado después). Sin sesión, la ficha del universo QA
responde 200, pinta la balda y no contiene `friends-on-saga`.

## e2e contra build de producción

`npm run build` + `npx next start -p 3000` a mano (servidor parado al acabar). Comando:
`npx playwright test e2e/sagas-ficha-lector.spec.ts e2e/sagas-v2.spec.ts`.

| Spec | Resultado |
|---|---|
| `sagas-ficha-lector` (12 previos + 2 nuevos) | 14/14 |
| `sagas-v2` | 4/4 |

Total 18/18 (59 s).

### Casos nuevos

1. **Con sesión:** por REST se leen los follows aceptados de devtest y sus pases en las obras del universo. Si
   hay alguna persona, el bloque existe con `min(personas, 4)` filas y enlaces a `/u/`; si no, no existe.
2. **Sin sesión:** no hay `friends-on-saga` ni su esqueleto.

## Qué no se verificó

- **La rama con amigos no se ejercitó:** devtest sigue (aceptado) a una sola persona y esta no tiene pases en
  las obras del universo QA, así que el caso 1 comprobó la ausencia del bloque. La pintura con datos reales solo
  está cubierta por los unitarios de `friends.test.ts` y `friends-on-saga.test.tsx`.
- Producción y la comprobación visual a 375 px.
- Límite conocido (decisión 2): quien sigue la saga sin pases en ella no aparece, porque `saga_follows` es de
  solo dueño.
