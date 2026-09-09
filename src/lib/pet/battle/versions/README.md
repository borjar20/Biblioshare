# Versiones de combate conservadas (R5)

Cada directorio es una versión publicada: código ejecutable, PRNG, validación,
serialización/hash, contenido y un ejemplo normativo. Sus imports de ejecución
permanecen dentro del directorio. El snapshot ya contiene los stats del jugador:
el replay no vuelve a consultar la progresión ni el catálogo actuales.

`replayBattle` selecciona la versión mediante **rulesetVersion + contentHash**.
Los identificadores desconocidos producen `UNKNOWN_RELEASE`; nunca se sustituyen
por el balance actual. El digest y el esquema de `pet_battles` no cambian.

Para cambiar comportamiento o balance (con herramienta desde R4a, #1093):

1. `npm run pet:battle -- fork <vieja> <nueva>`: copia el código ejecutable a `versions/<nueva>/`.
2. Editar `versions/<nueva>/` (nunca la vieja). Subir `RULESET.version`. Apuntar los reexports
   de `src/lib/pet/battle/*.ts` a `./versions/<nueva>/`.
3. `npm run pet:battle -- golden --version <nueva> [--chain N]`: ejemplo normativo de esa versión.
4. `npm run pet:battle -- freeze <nueva>`: escribe `manifest.json` y muestra el bloque para
   `BATTLE_RELEASES` (`replay.ts`, append-only). Añadir su test `rN-normative.test.ts`.
5. Verificar los ejemplos de TODAS las versiones y `releases.test.ts`. No regenerar fixtures
   ni manifiestos antiguos. Los ficheros de `src/lib/pet/battle/*.ts` son reexports: editarlos
   no cambia nada; el código vive en `versions/`.

`r2.2` conserva el comportamiento de la PR #1088, incluidos sus límites conocidos.
Un arreglo que cambie resultados necesita otra versión: conservar un replay no
significa aplicar retroactivamente las reglas nuevas al combate antiguo.

`r3.1` incorpora una ulti atomica tras 120 ticks y el enemigo `caparazon`.
El puzzle usa un subflujo PRNG independiente. Su normativa incluye la receta
Proteccion y la absorcion de barrera. El desempate de vida usa productos BigInt
para conservar exactitud sin cambiar la representacion persistida (enteros JSON).

`getBattleRelease` expone contenido y validacion para resolver filas abiertas de
su version original. La frontera de R2 abierta mantiene el payload vacio estricto
(`legacy-inputs.ts`); el replay historico conserva su validador publicado.
Un input elegido antes de una transicion letal en el mismo tick queda ignorado,
porque las transiciones preceden a las acciones. Los inputs posteriores al final,
incluido otro input tras un KO causado por una accion, se rechazan.
R3 conserva tambien su guard de snapshot dentro del directorio publicado; el registro importa su record e inputs directamente, sin depender de los exports actuales ni del catalogo de clases mutable.

`r4.1` (R4a) convierte la cadena de una aventura en un solo combate: `BattleInit.enemies[]`,
`enemy_id` con ids separados por coma, reloj continuo con `maxTicks` por tramo, eventos
`FIGHT_ENDED`/`FIGHT_STARTED`, ulti una vez por tramo (la juzga el motor, no el validador),
límite de tramo en cadena = derrota. Con un solo enemigo se comporta como r3.1 y conserva sus
números. Publicada con `fork`/`golden --version`/`freeze` (#1093).

`r4.2` (R4b) exige dos ranuras de equipo en el snapshot y aplica seis efectos
con potencia fija por copia. Los eventos `LOOT_EFFECT` incluyen la cantidad efectiva.
El replay consume ese equipo guardado; nunca consulta la selección actual. El fixture
normativo ejercita marcapáginas y amuleto; los tests del motor cubren los otros cuatro.
Balance y muestreo: `docs/testing/2026-09-08-r4b-balance.md`.
