# Mascota R5 — Bellotas y fondos del campamento

> **[Diseño aprobado el 2026-09-10 · sin implementar]**
> Contrato heredado: hoja de ruta Parte II, R5; issue #1017.
> Base leída: `main` en `b2a12f05`, con R4b publicada (#1146) y sus flecos cerrados (#1175).
> Este documento concreta el diseño; no acredita implementación, balance medido ni arte generado.
> **Cambia el contrato de la Parte I §12 y §15** (ver §9): el sumidero de las bellotas deja de ser
> la adquisición de equipo y pasa a ser cosmética. Decisión del usuario el 2026-09-10, tomada
> sabiendo que contradice la hoja de ruta y que obliga a generar arte antes de tener moneda.
> Todos los números son candidatos de calibración, no balance aprobado.

## 1. Punto de partida y alcance

R4b está publicada en producción desde el 2026-09-09 **sin aceptación jugable** (#1123 abierto,
guion en `docs/testing/2026-09-10-r4b-aceptacion-jugable.md`). El usuario decide avanzar a R5 igual.
Esta spec no da por aceptado R4b ni lo necesita: no toca el motor de combate, ni el botín, ni las
aventuras.

**Entrega R5:**

- **Bellotas**, la moneda del proyecto, ganadas usando Biblioshare y **nunca con dinero real**.
- **Un sumidero**: cuatro **fondos alternativos para la escena del campamento**, de compra directa.
- **Recogida manual** en el campamento, con desglose de lo que las generó.
- Ledger propio, compras idempotentes y a prueba de concurrencia.

**Fuera de R5**, y conviene que quede escrito para que nadie lo reimplemente leyendo un mockup
viejo: equipo comprable, gacha, aperturas aleatorias, duplicados, polvo, banners, pity, cosméticos
sobre el sprite de la ardilla, marcos, títulos, y el **objetivo semanal** que la Parte I menciona
como fuente (no existe en el código; R5 no es el sitio para crearlo).

**Relación con #1134 (tinta y desencantado).** R5 no lo resuelve, pero le contesta una de sus
preguntas abiertas —«si se usa una moneda separada de las bellotas de R5 y por qué»—: existiendo
bellotas ganadas por uso cultural, **una segunda moneda tendría que justificarse**, y la regla de
§15 («no se introduce otra moneda si puede evitarse») empuja en contra.

## 2. Experiencia propuesta

En el campamento, junto a la escena, un **puesto**. Dentro: el saldo, lo que hay por recoger y los
cuatro fondos con su precio.

1. **Recoger.** Un botón dice cuántas bellotas hay pendientes. Al tocarlo se ingresan y se ve el
   desglose: «+10 por el martes · +5 por la misión de ayer · +20 por el logro *Diez terminadas*».
   Sin desglose, el gesto es un número que sube sin decir por qué.
2. **Comprar.** Un fondo cuesta lo que cuesta; si no llega el saldo, el precio se ve igual y el
   botón dice cuánto falta. Comprar es **desbloqueo permanente**.
3. **Estrenar.** El fondo comprado se aplica al campamento y se ve al cerrar el puesto — la compra
   y su efecto ocurren en la misma pantalla, que es la razón de que la tienda viva aquí.
4. **Cambiar.** Poner otro fondo, incluido el original, es gratis y reversible siempre.

**La tienda no es un quinto destino.** La barra tiene cuatro por la decisión del 2026-09-09 (#1166)
y a 320 px va justa. El puesto es un elemento de la escena del campamento que abre un panel.

### Las bellotas no caducan

Es la condición que hace aceptable que haya gesto. **No hay ventana móvil, no hay caducidad, no hay
racha.** Recoger tras diez días da exactamente lo mismo que haber recogido cada día. Sin esa
garantía, «recoger» se convierte en fichar a diario, que es justo lo que R4a evitó a propósito
(«no hay obligación diaria») y lo que la Parte I §20 llama compañía y no comparación.

Nada del catálogo es temporal ni desaparece. Ningún fondo es exclusivo de un periodo.

## 3. Fuentes y calibración

Tres fuentes, **todas hechos ya guardados hoy**. R5 no crea ninguna señal nueva de actividad:

| Fuente | Hecho que la respalda | Clave | Candidato |
|---|---|---|---:|
| Día con actividad cultural real | `private.pet_lived_activity_days` | `day:<AAAA-MM-DD>` | 10 |
| Misión diaria completada | fila de `pet_daily_missions` con `completed_at` | `mission:<uuid>` | 5 |
| Logro nuevo | `user_celebrations`, `pet_achievement:<familia>:<nivel>` | `achv:<familia>:<nivel>` | 20 |

**La definición de «día vivido» es la que ya existe**, la misma que usan las aventuras de R4a y los
avisos push. Una sola definición en todo el proyecto: si algún día se afina el antifarm, se afina en
un sitio y las tres cosas se mueven juntas.

Con uso normal —cuatro días activos, seis misiones y un logro ocasional— salen ~85–95 bellotas por
semana, que es la cifra con la que ya calculaba la Parte I §12.

**Precios candidatos:** 100 / 150 / 150 / 150. El primer fondo cae en torno a la semana de uso
normal (decisión del usuario el 2026-09-10); los cuatro, en unas seis semanas.

**Sin fuentes por combatir.** Ni entrenar, ni ganar aventuras, ni repetirlas dan bellotas. Es la
misma línea que #1134: el avance sale de usar la app, no de jugar. El combate gasta tiempo, no
genera moneda.

### 3.1. Nada retroactivo, y una bienvenida fija

**El agujero que esto tapa:** las tres fuentes son hechos que ya existen *desde hace meses*. Sin
más reglas, la primera recogida barrería el historial entero —todos los días vividos, todas las
misiones selladas, todos los logros— y una cuenta veterana se plantaría con miles de bellotas el
primer día. Compraría el catálogo entero de una tacada y R5 incumpliría su propio criterio de
salida en el minuto uno.

Por eso:

- **Solo cuentan los hechos con fecha igual o posterior al día en que R5 llega a producción.** Es
  una constante en el código (`ACORN_EPOCH`), no una columna por usuario: la fecha es la misma para
  todo el mundo y se lee de un sitio.
- **Una bienvenida de 50 bellotas, una sola vez** (`source_key = 'welcome'`), para que quien ya
  llevaba tiempo no entre a una tienda con el bolsillo a cero. Es la mitad del primer fondo:
  acorta la primera semana sin regalar el catálogo.

Las dos reglas son deliberadas y discutibles; lo que no vale es dejarlo sin decidir, porque el
comportamiento por defecto —barrerlo todo— es el peor de los tres.

## 4. Persistencia, autoridad y concurrencia

### 4.1. El ledger

`pet_acorn_ledger`: una fila por hecho, ingreso o gasto.

- `user_id` (FK `auth.users` cascade), `source_key` (text), `amount` (int, positivo o negativo),
  `created_at`.
- **`unique (user_id, source_key)`** — aquí vive la idempotencia. Recoger dos veces, desde dos
  dispositivos o con un doble toque, **no puede duplicar**: la segunda inserción choca contra la
  restricción. No es una comprobación en código que se pueda olvidar.
- **Saldo = `sum(amount)`.** No hay columna de saldo que pueda descuadrarse respecto a sus
  movimientos.

Las claves de gasto son `buy:<cosmeticId>`, y como un cosmético se compra una vez, la misma
restricción hace la compra idempotente sin lógica adicional.

**Por qué ledger y no derivado.** La regla del proyecto es guardar solo decisiones y hechos, y
derivar el resto (§16.5). Un saldo **no se puede derivar**: gastar es una decisión, y si el saldo
se recalculara desde la actividad, un rebalanceo de `balance.ts` o una actividad editada cambiaría
retroactivamente lo que alguien ya se gastó. La Parte I ya lo clasifica como propio.

### 4.2. Los desbloqueos y el fondo activo

- `pet_cosmetics`: `user_id`, `cosmetic_id`, `acquired_at`, `unique (user_id, cosmetic_id)`.
- **El fondo activo es una decisión**, así que va en `pet_state` como columna `camp_scene` (text,
  nullable; `null` = la escena de siempre).

> **Columna nueva → superficie 6 de `DRIFT-CHECK`, sin excusa.** `pet_state` tiene grant por
> columna: **una columna sin su grant rompe la escritura ENTERA de la tabla**, no solo el campo
> nuevo. Compila, pasa el typecheck, pasa los unitarios y revienta en producción. Ha pasado dos
> veces (#375).

### 4.3. Escritura

Dos funciones en `public` (PostgREST solo expone ese esquema), **solo `service_role`**, con
`revoke` a `public, anon, authenticated`, como `start_pet_adventure` y `claim_pet_nudges`:

- **`claim_pet_acorns(p_user)`** — bajo `pg_advisory_xact_lock(20260910, hashtext(p_user::text))`
  (clave nueva; `20260908` está reservada para aventuras). Lee los hechos de las tres fuentes,
  inserta las filas que falten con `on conflict do nothing` y devuelve lo insertado, que es el
  desglose que pinta la UI. Si no hay nada, devuelve cero filas: recoger dos veces no es un error,
  es una recogida vacía.
- **`buy_pet_cosmetic(p_user, p_cosmetic)`** — bajo el mismo bloqueo: relee el saldo, comprueba el
  precio, e inserta el desbloqueo y su fila negativa **en la misma transacción**. Si ya estaba
  comprado, devuelve lo guardado sin cobrar. El bloqueo es lo que impide que dos toques simultáneos
  compren dos cosas con el saldo de una.

El precio vive en el código (`src/lib/pet/shop/catalog.ts`), no en la base: es contenido, como
`LOOT_ITEMS`. **La función recibe el precio ya resuelto** (`p_price`), igual que
`resolve_pet_adventure` recibe su `p_reward_order`, y no guarda una segunda copia de la tabla de
precios en SQL: dos copias del mismo contenido son deriva esperando a ocurrir. Es seguro porque la
función está revocada para `anon` y `authenticated` —solo la llama el servidor—, así que el precio
nunca viaja desde el cliente.

### 4.4. Actividad editada después

Una bellota ya recogida **no se revierte** aunque la actividad que la generó se edite o se borre
después. Es la misma regla que las aventuras («editar la actividad después no revierte una aventura
jugada»), por la misma razón: lo contrario permite dejar a alguien en negativo por corregir un dato,
y convierte una corrección honesta en un castigo.

Lo que **no** se ha recogido todavía sí desaparece si su hecho desaparece: mientras no esté sellado,
no existe.

## 5. Interfaz

- **Puesto en el campamento.** Un tablón sobre la escena, con el mismo sistema visual del RPG
  (`pet-game.module.css`, madera y musgo, escala de píxel entera). Abre un panel, no una ruta.
- **Saldo** siempre visible dentro del puesto; **no** se añade a la cabecera del campamento, que ya
  carga identidad, nivel y XP.
- **Recoger** es un botón con recuento; tras pulsar, una región `role="status"` con el desglose,
  legible por lector de pantalla, sin depender de la animación.
- **Catálogo**: cuatro tarjetas con miniatura, nombre, precio y estado (comprado / activo / cuánto
  falta). El fondo actual se marca; el original de siempre es una tarjeta más y es gratis.
- **Accesibilidad**: sin arrastre, sin cronómetro; el cambio de fondo respeta
  `prefers-reduced-motion`; contraste AA sobre cada fondo comprobado con el texto del campamento
  encima — **un fondo que rompa la legibilidad del campamento no entra al catálogo**, por bonito
  que sea.

## 6. Arte

Cuatro escenas nuevas de campamento, ~40 generaciones de PixelLab cada una (≈160 en total, del
presupuesto de 5.000/mes), con el agente `pet-artist` y la tubería de
`docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`. Candidatos a
`.superpowers/brainstorm/<fecha>/`; a `public/pet/scenes/` solo lo elegido, con su entrada de
procedencia.

Dos trampas ya conocidas de las escenas actuales: los generadores devuelven relleno abajo que hay
que **recortar, no reescalar** (`gathering.webp` acabó en 576×432 y `battle.webp` en 563×448), y
cada escena declara su propio `--scene-h`. Un fondo comprable **debe traer su alto real**, no fingir
uno común.

**Dependencia de secuencia.** La Parte I §14 dice que el arte de un hito se genera después de que el
anterior pase sus criterios, y R4b no los ha pasado. La economía se construye y se prueba sin arte
nuevo; los fondos existen cuando se generen. Si el usuario decide generarlos antes, es una decisión
suya como lo fue publicar R4b sin aceptación.

## 7. Verificación y criterios de salida

**Criterios de salida** (R5 era «dirección»; esta spec propone contrato):

- Usar Biblioshare con normalidad lleva al primer fondo en torno a una semana, sin que nadie
  necesite falsear registros ni partir sesiones.
- **Recoger tras varios días da exactamente lo mismo que recoger a diario.** Nadie vuelve por
  obligación; ninguna bellota se pierde por no entrar.
- El saldo no se descuadra: dos dispositivos, doble toque, reintento de red y actividad editada
  después no duplican ni pierden bellotas, y no dejan saldo negativo.
- Estrenar un fondo se nota, y volver al anterior es gratis.
- Ningún fondo del catálogo deja ilegible el texto del campamento.

**Verificación técnica mínima:**

- Matriz SQL en `supabase/tests/` con la doble recogida, la compra concurrente con saldo justo, la
  compra repetida y la actividad borrada tras recoger.
- Concurrencia real con dos conexiones, como `e2e/mascota-batallas-autoridad.spec.ts`.
- E2E: recoger con desglose, comprar sin saldo (rechazo legible), comprar, estrenar, volver atrás y
  sobrevivir a una recarga.
- Superficie 6 de `DRIFT-CHECK` tras añadir `camp_scene`, y el recuento de columnas/grants de
  `pet_state` comparado con dev **y** con prod.
- Perfiles sintéticos de `deriveAttributes` para comprobar el ritmo de las tres fuentes sin esperar
  una semana real.

## 8. Orden de implementación

1. Catálogo y precios en código, con sus tests (contenido puro, sin base de datos).
2. Migración: `pet_acorn_ledger`, `pet_cosmetics`, `camp_scene` en `pet_state`, las dos funciones y
   sus `revoke`. **Dev primero**, prod después.
3. Servicio y acciones de servidor; idempotencia y bloqueo cubiertos por la matriz SQL.
4. Puesto en el campamento: recoger con desglose, comprar, estrenar.
5. Arte de los cuatro fondos (gate del §6) y su procedencia.
6. Sincronizar `data-model.md` §8bis, `backlog.md`, la Parte II de la hoja de ruta y `decisiones.md`.

## 9. Lo que esto cambia del contrato, y por qué se escribe aquí

La Parte I §12 dice: «Las bellotas nacen en R5 junto con la tienda (adquisición directa de equipo);
los cosméticos se suman como segundo sumidero en R10». La Parte II repetía lo mismo.

**Ya no es así.** El usuario decide el 2026-09-10 que las bellotas no toquen el poder: se gastan en
apariencia. Se le presentó que contradice la hoja de ruta, que R10 era el sitio de la cosmética y
que obliga a generar arte antes de tener moneda; lo eligió con eso escrito delante.

Consecuencias que hay que asumir, no esconder:

- **R5 necesita arte para existir.** El sumidero original no lo necesitaba: el equipo ya estaba
  dibujado. Sin las cuatro escenas, la moneda no tiene dónde gastarse y R5 no cumple su propia
  regla («ninguna moneda existe sin su sumidero»).
- **R10 se queda sin su primer sumidero** y pasa a ser gacha y catálogo grande sobre una cosmética
  que R5 ya habrá estrenado.
- **La adquisición directa de equipo queda sin hito.** No se pierde: o vuelve en R9/R10, o se
  descarta explícitamente. Mientras no se decida, es una pregunta abierta y no un olvido.

La entrada correspondiente va **al final** de `docs/requirements/decisiones.md` (append-only), y la
Parte I y la Parte II se corrigen para no seguir afirmando algo que dejó de ser cierto.
