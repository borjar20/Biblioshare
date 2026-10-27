# Ficha de saga para el lector, fase 2: evidencia

> **[Evidencia local · 2026-10-28]** Rama `claude/sagas-ficha-fase-2` (apilada sobre `claude/sagas-rework-11497e`,
> PR #1553), PR pendiente. Diseño en [la spec](../superpowers/specs/2026-10-27-sagas-ficha-lector-design.md);
> decisiones en [`decisiones.md`](../requirements/decisiones.md) (entrada del 2026-10-28). Sin migraciones ni
> cambios de esquema. Producción no verificada.

## Qué se entrega

En `/saga/[id]`: «Tu paso por la saga» (solo con sesión y pases), «Subsagas» (una puerta por hija con obras),
acceso al mapa con vista previa (solo con el mapa encendido) y «Tu nota media» dentro de «La terminaste».
Cierra #1539 y, por la decisión 6, #761.

## Unitarios

`npx vitest run src/lib/sagas src/components/saga src/lib/reactivity src/app/saga` (Node 22): **58 ficheros,
694 tests, todo verde**. `npx tsc --noEmit -p .` y `npx eslint e2e/sagas-ficha-lector.spec.ts`, limpios.

## e2e contra build de producción

`npm run build` + `npx next start -p 3000` arrancado a mano (puerto 3000 libre antes y después; servidor
parado al acabar). Comando: `npx playwright test e2e/sagas-ficha-lector.spec.ts e2e/sagas-v2.spec.ts
e2e/sagas-itinerarios.spec.ts e2e/sagas-v2-curacion.spec.ts`.

| Spec | Resultado |
|---|---|
| `sagas-ficha-lector` (8 previos + 4 nuevos) | 12/12 |
| `sagas-itinerarios` | 6/6 |
| `sagas-v2` | 4/4 |
| `sagas-v2-curacion` | 2/2 |

Total 24/24 en una sola pasada (1,4 min). Ningún fallo, así que no hubo que compararlo con los preexistentes
(#1543–#1546).

### Casos nuevos (en `sagas-ficha-lector`)

1. **Con sesión, «Tu paso»:** «Terminadas» coincide con las obras distintas del universo con un pase `completed`
   de devtest, leído por REST (`passes` + `saga_items`). Si devtest no tiene ninguna terminada, solo se comprueba
   que, si el bloque aparece, dice 0.
2. **«Subsagas»:** los enlaces de las tarjetas son exactamente `/saga/<id>` de las hijas directas con obras en su
   subárbol, calculadas por REST.
3. **Acceso al mapa:** según `sagas.show_map` por REST, `atlas-teaser` existe y enlaza a `/saga/<id>/mapa`, o no
   existe.
4. **Sin sesión:** no hay `your-passage`; cada puerta enseña «N obras» y ningún « de ».

## Qué no se verificó

- Producción.
- Qué rama toma el caso 1 (devtest con terminadas o sin ellas) no se registró en la ejecución; depende de los
  pases de devtest, que otros specs mueven. El valor concreto de favorita, media, páginas/minutos, curva y
  «opcionales saltadas» solo está cubierto por unitarios (`passage.test.ts`), no por e2e.
- «Tu nota media» en «La terminaste» no tiene e2e (exige una saga entera terminada con notas).
- Comprobación visual de las tres piezas en navegador y a 375 px: no repetida en esta tarea.
- El seed no tiene opcionales, así que «Te saltaste X de Y» no se ejercita en e2e.
