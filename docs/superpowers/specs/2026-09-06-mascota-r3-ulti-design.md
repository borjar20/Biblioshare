# R3 — Ulti y segundo enemigo

> Implementación de la hoja de ruta, Parte II R3. El usuario acepta avanzar desde R2 el 2026-09-06 después de probar el combate y sus ajustes de legibilidad (#1100). No se afirma un número de combates no comunicado.

## Alcance

Entrenamiento gratuito para las seis clases. Ulti genérica, segundo enemigo y arte de combate PixelLab. Sin economía, recompensas ni especializaciones. Los controles conservan su posición al cambiar los mensajes.

## Contrato de combate

- Nueva versión `r3.1`; `versions/r2.2` y su digest normativo permanecen intactos. Los registros abiertos y los replays conservan su versión original.
- Ulti disponible tras 120 ticks (12 s de simulación), una vez por combate. Abrir su widget pausa la simulación en el tick actual. Cancelar no gasta; saltar aplica el efecto base. Resolver genera una única acción atómica `ulti` con payload `{order: "0123"}` (permutación de cuatro fichas) o `{order: ""}` para saltar. No se aceptan puntuaciones del cliente.
- El servidor regenera el puzzle desde seed y tick con un PRNG separado; no consume el RNG del enemigo. Dos recetas visibles: Potencia y Protección. Las fichas y recetas siempre permanecen a la vista; tocar ficha y hueco, sin arrastre ni cronómetro. La elección de receta cambia el efecto; no mide memoria ni velocidad.
- `createUltiPuzzle(seed, tick)` devuelve `{recipes: [{id: "power" | "guard", order: number[]}]}`. Cada orden es una permutación de 0..3, distinta de la otra. Las fichas son genéricas y numeradas, traducidas en UI.
- `scoreUlti(seed, tick, order)` devuelve `{recipe: "power" | "guard" | null, matches: number}`. Coincidencias por posición; se elige la receta con más coincidencias, empate hacia potencia; saltar produce cero. Base de daño 4×ATK. Potencia añade hasta 2×ATK proporcional a las coincidencias (entero). Protección añade barrera de hasta 20% de HP máximo proporcional a coincidencias. Ningún resultado elimina el efecto base; la barrera absorbe daño futuro y se consume.
- `BattleView` añade `ultiReadyAt`, `ultiUsed`, `shield`; eventos `ULTI_USED` incluyen receta, coincidencias, daño, barrera y HP; los usos prematuros/repetidos se rechazan como log inválido. Se verifica también el orden/forma del payload y usos después del KO.
- Segundo enemigo `caparazon` (Escarabajo coraza): alterna reposo → guardia → vulnerable → reposo. La guardia mantiene el castigo existente; en vulnerable los golpes causan el doble. La habilidad lo comunica mediante efecto `vulnerable`. El Brote mantiene carga frente a guardia. El entrenamiento permite escoger enemigo antes de iniciar; un reintento mantiene el primero fijado en servidor.
- El servidor selecciona contenido y validador por la versión almacenada, tanto al resolver una fila abierta como al reproducirla. Nunca interpreta un R2 como R3.

## Arte

Personajes completos PixelLab. Los 18 estados adulto/joven/veterano por seis clases en east: idle de combate, ataque, golpe, KO; ambos enemigos con telegraphs. Arte de combate en manifiesto/sheets separado para preservar caja táctil y animaciones de la compañera. La bellota conserva su arte existente. Nada generado fuera de PixelLab se considera arte final R3.

## Verificación

Determinismo, payload manipulado, ulti prematura/repetida, salto útil, pausa real del puzzle, daño/barrera, comportamiento distinto de enemigos, aislamiento entre cuentas e idempotencia, R2 normativo y replay. Navegador móvil con teclado, controles estables y movimiento reducido. R3 no se declara completo mientras falte el arte acordado o su revisión visual.
