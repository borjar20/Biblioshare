# Versiones de combate conservadas (R5)

Cada directorio es una versión publicada: código ejecutable, PRNG, validación,
serialización/hash, contenido y un ejemplo normativo. Sus imports de ejecución
permanecen dentro del directorio. El snapshot ya contiene los stats del jugador:
el replay no vuelve a consultar la progresión ni el catálogo actuales.

`replayBattle` selecciona la versión mediante **rulesetVersion + contentHash**.
Los identificadores desconocidos producen `UNKNOWN_RELEASE`; nunca se sustituyen
por el balance actual. El digest y el esquema de `pet_battles` no cambian.

Para cambiar comportamiento o balance:

1. Crear una versión nueva, conservando las anteriores sin modificaciones.
2. Actualizar los exports de la API actual y generar el nuevo ejemplo normativo.
3. Añadir la nueva identidad y su implementación a `BATTLE_RELEASES`.
4. Verificar los ejemplos de TODAS las versiones conservadas y el test de replay
   histórico. No regenerar los ejemplos ni los manifiestos de versiones antiguas.

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
