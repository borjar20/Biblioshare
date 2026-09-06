# R4a — Aventuras derivadas y botín pendiente de activar

> **[Spec de diseño · aprobada por el usuario el 2026-09-06 · implementa la Parte II R4 de
> `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md`, desdoblada en R4a y R4b]**
>
> Antecedentes: R1 `2026-09-06-mascota-r1-contratos-combate-design.md`, R3
> `2026-09-06-mascota-r3-ulti-design.md`. R3 está mergeada (PR #1107) y pendiente de aceptación
> jugable (#1106). Esa aceptación NO bloquea diseñar ni implementar R4a; sí bloquea mergear R4a a
> producción y generar cualquier arte de R4.

## 1. Qué es R4a y por qué se desdobla R4

El contrato R4 de la hoja de ruta junta dos subsistemas: aventuras derivadas de la actividad
(concesión, antifarm, gasto idempotente, reanudación) y primer botín (inventario, dos ranuras,
4–6 objetos con efecto, versión de motor, iconos y VFX). Cada uno solo tiene el tamaño de R3.
Se parten en dos specs secuenciales:

- **R4a (esta spec):** la aventura existe como cosa distinta del entrenamiento, se concede por
  actividad real, se gasta una vez, se reanuda y, al ganarla, entrega un objeto del catálogo que
  todavía no hace nada en combate.
- **R4b (spec futura):** los objetos entran en el motor, dos ranuras, equipar y comparar, iconos y
  VFX. Se diseña cuando R4a pase sus criterios.

Criterios de salida de R4 que R4a debe cumplir por sí sola: acceso suficiente usando Biblioshare
con normalidad; ni partir sesiones, ni borrar y volver a registrar, ni dos dispositivos dan más
aventuras o duplican recompensas; editar la actividad después no revierte una aventura jugada;
ningún cambio de hábito negativo observado. El criterio «un objeto nuevo da ganas de probarlo y
ninguna build domina» es de R4b.

## 2. Decisiones de producto (tomadas en el brainstorming del 2026-09-06)

| Decisión | Elegido | Descartado y por qué |
|---|---|---|
| Forma de la aventura | Cadena de dos o tres enfrentamientos seguidos contra Brote o Escarabajo, enemigos fijados por el seed | Un solo combate (no se distingue del entrenamiento salvo por el envoltorio); elegir enemigo (ninguna decisión nueva) |
| Vida entre tramos | Se arrastra tal cual. Habilidad, ulti y barrera se reinician al empezar cada tramo | Recuperación parcial (un número más); descansar-o-seguir (sistema de calidad de botín, que es R9) |
| Derrota | Reintento gratis e ilimitado desde el principio de la cadena, vida llena, seed nuevo | Retomar el tramo perdido con la vida que tenías (callejón sin salida al llegar al último con poca vida); retomar con vida llena (perder cura) |
| Disparador | Uno: el día con actividad cultural real según `private.pet_lived_activity_days` | Misiones y objetivo semanal (tres identificadores de gasto, y las misiones son la primera puerta a falsear registros) |
| Tope | Ventana móvil de siete días en Europe/Madrid: hoy y los seis anteriores | Contar toda la historia con tope de pendientes (un import histórico alimentaría aventuras durante meses) |
| Botín | Se sortea y se guarda al ganar, marcado «pendiente de activar»; catálogo de seis con id estable | Sin botín (no mediríamos si atrae); botín con efecto (es R4b) |
| Arquitectura | La cadena entera es un solo combate para el motor (versión r4.1) y una sola fila de `pet_battles` | Tabla `pet_adventures` orquestando combates normales (máquina de estados nueva y dos capas de idempotencia); estado deducido de filas con `intent_id` compuestos |

**Sobre «no caducan» (Parte I §9).** Se interpreta como «no hay energía con temporizador que
obligue a entrar cada día». Un día vivido que sale de la ventana sin jugarse deja de contar: ese es
el «tope por periodo» del mismo párrafo y lo que evita que un import de 200 filas dé 200
aventuras. Una aventura **ya empezada** nunca se pierde: su fila existe y sigue reanudable o
reintentable aunque el día salga de la ventana. Va a `decisiones.md`.

## 3. Motor: versión r4.1

Se publica con la herramienta de #1093, que se construye primero (ver §11). Todo cambio es código
puro bajo `purity.test.ts`, con su fixture normativo.

- **Entrada.** `BattleInit.enemies: EnemyDef[]` sustituye a `enemy`. `Ruleset.chainLength`
  (1 en entrenamiento; 2 o 3 en aventura, según §10). El snapshot no cambia de forma.
- **Entrenamiento.** Usa r4.1 con un solo tramo y los números de r3.1 sin tocar (`content.ts`
  conserva `ulti`, `skillCooldown`, `BROTE`, `CAPARAZON`). Jugar entrenamiento sigue siendo
  idéntico; no hay dos versiones activas.
- **Reloj.** Continuo: `maxTicks` por tramo (600), medido desde su tick de inicio; se conserva
  el tick cero de r3.1. El siguiente tramo empieza en el tick posterior al KO. La cota global
  inclusiva es `chainLength * (maxTicks + 1) - 1`; no se confunde con el límite local del tramo.
  Los ticks no se reinician; la vista expone `fight` (1-based) y `fights`.
- **Frontera de tramo.** Cuando el enemigo del tramo llega a cero y no es el último: se emite
  `FIGHT_ENDED {fight, petHp}`, se reinician `skillReadyAt`, `ultiReadyAt`, `ultiUsed` y `shield`
  relativos al tick siguiente, se instancia el siguiente enemigo desde el estado del PRNG (sin
  reseed) y se emite `FIGHT_STARTED {fight, enemyId, petHp, enemyHp}` en ese tick. La vida de la
  mascota no cambia.
- **Fin.** KO del último enemigo = victoria. KO de la mascota en cualquier tramo = derrota con
  `reason: "ko"`. Agotar `maxTicks` de un tramo en cadena = **derrota** con `reason: "limit"`.
  En entrenamiento (`chainLength = 1`) se conserva la comparación de fracciones de vida de
  r3.1: victoria si la de la mascota es mayor, derrota si es menor y empate solo si son iguales.
  El resultado añade `fight` (tramo en que acabó).
- **Validación de inputs.** El validador de r4.1 mantiene forma, secuencia, orden y payloads,
  pero acepta ticks hasta la cota global anterior y un presupuesto de inputs de
  `maxInputs * chainLength` (el valor existente sigue siendo el presupuesto por tramo).
  No rechaza una segunda ulti por haber otra en un tramo anterior. La re-simulación comprueba
  `ultiReadyAt` y `ultiUsed` en el estado del tramo real: rechaza usarla antes de tiempo o dos
  veces en el mismo tramo y acepta una por tramo tras su recarga. Las fronteras las deriva el
  motor, nunca el cliente ni una división del tick por 600. Se siguen rechazando inputs después
  del final efectivo. Los validadores históricos de r2.2 y r3.1 permanecen intactos.
- **Enemigos por seed.** `pickEnemies(seed, chainLength)` con un PRNG separado (mismo patrón que
  `createUltiPuzzle`): uniforme sobre `ENEMIES`, repetición permitida. El servidor guarda la lista
  en `enemy_id` separada por comas y comprueba al re-simular que coincide con la derivada.
- **#1086 se cierra aquí.** El bucle de inputs hace `switch (input.action)` con ramas `skill` y
  `ulti` y `default` que lanza `UNKNOWN_ACTION`: si llega, `validateInputs` y el motor se han
  desincronizado.
- **#1087 se cierra aquí.** Los cuatro tests del orden del tick (KO por castigo a mitad del
  bucle de inputs, KO y límite en el mismo tick gana KO, aturdimiento que expira en el tick del
  input, y el tope de dos causas de `causesFor` con tres o más candidatas) se escriben ANTES de
  tocar el bucle, sobre r3.1 y sin mover su fixture normativo.
- **Replays.** `versions/r2.2` y `versions/r3.1` no se tocan; sus fixtures normativos y
  `releases.test.ts` siguen verdes. El servidor selecciona validador y contenido por la versión
  almacenada, como en R3.

## 4. Persistencia

Migración `supabase/migrations/20260908_pet_adventures.sql` (dev primero, luego prod), aditiva
sobre `pet_battles`:

```sql
alter table public.pet_battles
  add column adventure_day date,
  add column attempt smallint,
  add column reward jsonb;

alter table public.pet_battles add constraint pet_battles_adventure_shape check (
  (kind = 'adventure' and adventure_day is not null and attempt is not null and attempt >= 1)
  or (kind <> 'adventure' and adventure_day is null and attempt is null)
);
alter table public.pet_battles add constraint pet_battles_reward_resolved check (
  reward is null or status = 'resolved'
);
create unique index pet_battles_adventure_attempt_idx
  on public.pet_battles (user_id, adventure_day, attempt) where kind = 'adventure';
create unique index pet_battles_adventure_open_idx
  on public.pet_battles (user_id) where kind = 'adventure' and status = 'open';
create unique index pet_battles_adventure_win_idx
  on public.pet_battles (user_id, adventure_day)
  where kind = 'adventure' and status = 'resolved' and result->>'outcome' = 'win';
```

- `reward` es `{ "itemId": string, "slot": "weapon" | "amulet" }` o null. **Fuera del digest**:
  depende de lo que el usuario ya posee, que no es parte del combate.
- Grants sin cambio: `authenticated` solo `select` propio; escribe `service_role`. El plan
  comprueba con `has_column_privilege` que el `select` de las tres columnas nuevas llega a
  `authenticated` en dev y prod (si el grant fuera por columna, añadirlo). La superficie 6 de
  DRIFT-CHECK no aplica (sin grant de escritura), y se anota en `data-model.md` §8bis.5.
- `intent_id` sigue siendo uuid v4; en aventuras lo genera el servidor.
- Los índices garantizan una sola aventura abierta **por usuario**, intentos únicos por día y
  una sola victoria por día. Son defensa adicional a la operación atómica de §6; no sustituyen
  la serialización de la selección y la escritura.
- **Dos funciones SQL de escritura en la misma migración**, porque supabase-js no abre
  transacciones y la serialización por usuario exige una: `private.start_pet_adventure(p_user
  uuid, p_seed text, p_intent uuid, p_enemies text, p_ruleset_version text, p_content_hash text,
  p_snapshot jsonb)` y `private.resolve_pet_adventure(p_user uuid, p_intent uuid, p_inputs jsonb,
  p_result jsonb, p_digest text, p_reward_order text[])`. Ambas `security definer`, `set
  search_path = ''`, `revoke all` a `public, anon, authenticated`; solo `service_role` las
  ejecuta, con el usuario que el servidor toma de la sesión. Las dos empiezan con
  `pg_advisory_xact_lock(<clave fija de aventuras>, hashtext(p_user::text))`, que se libera solo
  al terminar la transacción. **Es el primer bloqueo consultivo del repo**: se documenta en
  `data-model.md` con su clave, para que la siguiente función que necesite uno no la reutilice.
  El esquema `private` no se expone en PostgREST; el servidor las llama con el cliente de
  `service_role` vía `rpc`, como ya hace con `get_burrow_pets` desde el cliente de sesión.

## 5. Concesión derivada: RPC

Mismo patrón que `get_burrow_pets` (§8bis.6):

- `public.get_pet_adventure_days() returns table (day date)`, `security invoker`, delega en
  `private.pet_adventure_days(p_viewer uuid)`, `security definer`, `set search_path = ''`,
  que exige `p_viewer = auth.uid()`.
- Devuelve los días de `private.pet_lived_activity_days(p_viewer)` dentro de
  `[hoy − 6, hoy]` con `hoy = (timezone('Europe/Madrid', now()))::date`, excluyendo los días con
  alguna fila `kind = 'adventure'` de ese usuario, cualquiera que sea su estado. Orden ascendente.
- Nada se escribe al conceder. `revoke execute` de ambas funciones a `public, anon`; `grant
  usage` del esquema `private` y `grant execute` de ambas funciones a `authenticated`.
  El wrapper `security invoker` necesita ese permiso sobre la privada, como en madriguera.
  La privada mantiene la comprobación de identidad incluso si se invoca directamente; el
  esquema `private` no se expone en PostgREST.

Estados de un día, tal como los presenta la UI:

| Situación | Estado |
|---|---|
| Día vivido en ventana, sin fila | Pendiente |
| Fila abierta | En curso: reanudar |
| Solo filas perdidas | En curso: reintentar |
| Alguna fila ganada | Completada |

Por qué cumple los criterios: partir sesiones no cambia el día; borrar y volver a registrar no
crea un día nuevo; las ráfagas de diez o más pases creados el mismo día ya las descarta la función
existente; editar la actividad después puede sacar el día de la lista derivada, pero la fila
insertada se queda; dos dispositivos se serializan por usuario (§6), con índices de respaldo; y aunque alguien registre sesiones
con fecha atrasada, el tope duro es siete por semana móvil.

## 6. Servicio y server actions

`src/lib/pet/adventure/` con `actions.ts` (`"use server"`), `service.ts`, `repository.ts`,
`types.ts`. El servicio reutiliza el de entrenamiento (`createTrainingService`) para lo común:
recuperar, re-simular, resolver y verificar digest. Lo que se extraiga a compartir se mueve a un
módulo común; no se copia.

- `getAdventureState()` → `{ pendingDays: string[], current: AdventureBattle | null,
  inventory: InventoryEntry[] }`. `current` es el intento abierto o, si no lo hay, el último
  perdido de un día sin victoria; `inventory` se deriva de las filas ganadas (§7).
- `startAdventure()` sin argumentos. Toda la selección e inserción es una operación atómica
  del repositorio en una transacción de base de datos, serializada por usuario: la función
  `private.start_pet_adventure` de §4. El servidor genera antes seed, `intent_id`, lista de
  enemigos y snapshot y se los pasa; la función decide bajo el bloqueo si los usa o devuelve una
  fila existente. El bloqueo se toma antes de leer y se mantiene hasta el commit; no sirve un
  mutex en el proceso del servidor. Orden bajo ese bloqueo: (1) si hay intento abierto,
  devolverlo; (2) si hay un
  día con intentos y sin victoria, insertar el intento `max + 1` de ese día; (3) si no, tomar el
  día pendiente más antiguo según la concesión de §5, recalculada dentro de la transacción,
  e insertar el intento 1; (4) sin nada, `NO_ADVENTURE`. Una lista obtenida previamente por la
  RPC de lectura no autoriza la inserción. La operación de escritura solo es accesible al
  servidor con `service_role`, con el usuario obtenido de la sesión autenticada.
  Seed de 128 bits del servidor, enemigos por `pickEnemies`, `enemy_id` con la lista. Ante un
  choque de índice se revierte la transacción y se relee el estado bajo el mismo bloqueo antes
  de decidir; nunca se consume otro día como alternativa automática al conflicto.
- `resolveAdventure(intentId, inputs)`: igual que `resolve` de entrenamiento con la versión
  almacenada. La re-simulación se hace fuera de la transacción, en el servidor; para guardar se
  llama a `private.resolve_pet_adventure` (§4), que toma el mismo bloqueo por usuario que
  `startAdventure` y relee el intento. Un resultado ya guardado gana sobre cualquier reintento
  con inputs distintos: la función devuelve la fila guardada sin tocarla. Si sigue abierto y el
  resultado es victoria, comprueba que el día no tiene otra victoria, lee el inventario y elige
  el botín como el primer id de `p_reward_order` que el usuario no posee (o el primero de la
  lista si los posee todos), todo dentro de esa transacción. Resultado, botín y `status =
  'resolved'` se escriben juntos mediante compare-and-set de `status = 'open'`. Así iniciar y
  resolver no pueden usar lecturas obsoletas para reabrir un día ganado o duplicar su
  recompensa, y el PRNG sigue viviendo solo en TypeScript (§7).
- `replayAdventure(intentId)`: como en entrenamiento.
- Errores con código, como hoy: `NO_PET`, `NO_ADVENTURE`, `NOT_FOUND`, `UNKNOWN_RELEASE`,
  `INVALID_SNAPSHOT`, `ENEMIES_MISMATCH`, más los de `validateInputs`.

Casos de §16.6 y cómo se resuelven: doble clic → (1) devuelve el mismo abierto; reintento de red →
mismo `intentId`, resultado guardado gana; dos dispositivos → transacción serializada por usuario
e índices únicos; cierre de app → fila
abierta más log local (§8); derrota y reintento → (2); combate ya resuelto → `saved`; actividad
editada → la fila persiste, la concesión se recalcula sola.

## 7. Botín

`src/lib/pet/loot/catalog.ts`: seis objetos con `id`, `slot` y clave de traducción. Sin efecto ni
números en R4a. La dirección prevista se documenta como comentario para que R4b no renombre ids:

| id | Ranura | Nombre | Dirección prevista (R4b) |
|---|---|---|---|
| `sharp_bookmark` | arma | Marcapáginas afilado | la interrupción pega más |
| `heavy_ink_quill` | arma | Pluma de tinta pesada | la ulti de Potencia pega más |
| `librarian_loupe` | arma | Lupa del bibliotecario | la ventana vulnerable dura más |
| `last_page_amulet` | amuleto | Amuleto de la Última Página | usar la ulti concede una barrera pequeña |
| `loan_pendant` | amuleto | Colgante del préstamo | la habilidad recarga antes tras interrumpir |
| `streak_medallion` | amuleto | Medallón de la racha | empezar cada tramo con algo de vida extra |

- `rewardOrder(seed)`: PRNG separado sembrado con el seed de la aventura (como
  `createUltiPuzzle`) que devuelve una permutación de los seis ids. Pura y determinista. El
  servidor la pasa a `private.resolve_pet_adventure`, que elige **el primer id no poseído** (o el
  primero de la lista si se poseen todos) bajo el bloqueo de la transacción. El primer elemento
  no poseído de una permutación uniforme es uniforme entre los no poseídos, así que el resultado
  es el mismo que sortear entre ellos, pero la lectura del inventario y la elección ocurren dentro
  de la transacción y el PRNG no se duplica en SQL. `pickReward(order, ownedIds)` en TypeScript
  aplica la misma regla, para tests y para mostrar el botín sin releer.
- `owned` = ids de `reward` en filas `kind = 'adventure'`, `status = 'resolved'`, resultado
  victoria, del usuario. El inventario se deriva de ahí, agrupado por id con recuento. No hay
  tabla de inventario; equipar (decisión) tendrá la suya en R4b.
- Duplicados: se guardan y se muestran contados («×2»). Qué hacer con ellos lo decide R4b.
- Si R4b cambia algún id, migra los `reward` guardados; se abre issue al cerrar esta spec.

## 8. Cliente e interfaz

Todo en `/mascota` (`src/app/mascota/page.tsx`). Componentes en `src/components/pet/adventure/`.

- **Sección Aventuras**, encima del entrenamiento: recuento de pendientes («3 aventuras
  pendientes»), estado en curso si lo hay (reanudar o reintentar), botón «Empezar aventura»
  deshabilitado con explicación cuando no hay nada, e inventario ganado como tarjetas con nombre,
  ranura, pictograma genérico de la ranura y la etiqueta «se activa en la siguiente actualización».
  Datos por usuario: sin `use cache`, detrás de `Suspense`.
- **Panel de combate**: se reutiliza el de entrenamiento con tres añadidos: marcador «Tramo 2 de
  3» estable en su sitio; pantalla entre tramos con vida actual y botón «Continuar» (la simulación
  no avanza hasta pulsarlo; equivale a una pausa en el tick de `FIGHT_STARTED`); tarjeta de botín
  en el resultado de victoria. En derrota, «Reintentar» y una línea que dice que la aventura no se
  pierde.
- **Reanudación**: el log parcial y el tick alcanzado se guardan en `localStorage` por
  `intent_id` en cada input y en cada pausa, como extensión de la pausa actual. Al volver, si hay
  intento abierto y log local para su `intent_id`, se re-simula hasta ese tick y se sigue en pausa.
  Si no hay log local, el intento arranca desde el tick cero con el mismo seed y sin penalización
  (consecuencia aceptada: quien borre el almacenamiento adrede repite una cadena conocida; PvE sin
  ranking y botín sin poder). Al resolver, se borra la entrada local.
- **Celebración** `pet_adventure:<día>` en `user_celebrations`, una por día ganado, con el
  mecanismo existente (`earnCelebration`).
- **Accesibilidad**: las de R3 (teclado, movimiento reducido, controles que no se mueven) más el
  cambio de tramo y el botín anunciados en la región viva.
- **Textos**: todas las cadenas nuevas en `messages/es.json` a través del agente `i18n-keeper`.
- **Sin arte nuevo.** Los iconos PixelLab de los objetos y cualquier VFX son de R4b, y solo se
  generan cuando R3 haya pasado su aceptación (#1106).

## 9. Fuera de alcance de R4a

Efectos de los objetos, equipar, comparación, iconos y VFX, tratamiento de duplicados, bellotas,
más disparadores, log parcial en servidor, versión r4.2. Nada de esto se adelanta «porque ya
estamos ahí».

## 10. Calibración y verificación

**Calibración (decide la longitud de la cadena).** Se amplía `calibrate` y el CLI
`npm run pet:battle -- calibrate` para cadenas. Informe de 2 y 3 tramos, 6 clases × 6 perfiles ×
3 políticas (`never`, `spam`, `interrupt`), 200 seeds por celda. Se elige la longitud con la que
`interrupt` gana la cadena entre el 50 % y el 75 % y `never` queda por debajo del 1 %. Si ninguna
de las dos cae en la banda, se ajusta primero la longitud (y se documenta) y solo después se
plantea tocar un número de `content.ts`; ese cambio sería una decisión aparte con su entrada en
`decisiones.md`. La tabla resultante se pega en esta spec al cerrar.

**Unitarios (Vitest).**
- Motor: arrastre de vida, reinicios en frontera, `FIGHT_ENDED`/`FIGHT_STARTED`, límite de tramo
  como derrota en cadena y comparación de vida en entrenamiento (victoria, derrota y empate),
  KO en el tramo dos, `pickEnemies`
  determinista, determinismo sobre 50 seeds, fixture normativo r4.1, `default` de #1086, los
  cuatro de #1087, replays r2.2 y r3.1 intactos, `purity.test.ts` con umbral por versión (#1093).
- Inputs r4.1: log válido con input después del tick 600 y ulti en dos tramos distintos;
  rechazo de ulti prematura, dos ultis en el mismo tramo, ticks fuera de la cota global e
  inputs después del final; presupuesto global y bordes del reloj. Verificar el log completo
  por la misma ruta de validación y re-simulación que usa el servidor.
- Herramienta `freeze`: crea `versions/<v>/`, rechaza sobrescribir, genera fixture y manifiesto,
  registra la entrada.
- Botín: `rewardOrder` es una permutación de los seis y es determinista; `pickReward` prefiere
  no poseídos y cae al primero al completar; ids del catálogo únicos y con ranura válida.
- Servicio: los siete casos de §6, con repositorio en memoria que simula los choques de índice
  y el contrato atómico; resolución repetida conserva exactamente el mismo botín.
- Cliente: reanudación desde log local, ausencia de log local, borrado al resolver, marcador
  estable.

**SQL (matriz como la de la madriguera, contra dev).** Bordes de la ventana (hoy − 6 entra,
hoy − 7 no), ráfaga excluida, día con fila abierta/perdida/ganada excluido, `p_viewer` ajeno
rechazado, llamada legítima de `authenticated` a la RPC pública con actividad que devuelve sus
días, llamada privada con identidad ajena rechazada, `anon` sin ejecución, `authenticated` y
`anon` sin `execute` sobre `start_pet_adventure` ni `resolve_pet_adventure`, `resolve` sobre una
fila ya resuelta que devuelve la guardada sin cambiarla, elección del botín como primer id no
poseído de la lista, CHECKs y los tres índices únicos. Con dos conexiones reales del mismo
usuario, forzar inicios concurrentes con
dos días pendientes: ambos recuperan el mismo intento y solo se consume un día. Forzar también
inicio frente a resolución y dos resoluciones concurrentes: ningún día ganado se reabre y solo
se guarda una recompensa. El repositorio en memoria no sustituye estas pruebas de transacción.

**E2E (Playwright, dos cuentas, contra build de producción, dev server arrancado a mano).**
- Autoridad: por PostgREST nadie inserta ni actualiza una fila de aventura ni un `reward`; una
  cuenta no ve las aventuras de la otra; `get_pet_adventure_days` de la otra cuenta devuelve solo lo
  suyo.
- Flujo: cuenta con actividad de hoy ve una pendiente → empezar → recargar a mitad del tramo uno →
  reanudar en pausa → ganar → botín visible e inventario actualizado → pendientes decrementadas.
- Derrota y reintento: perder → «Reintentar» → nuevo intento del mismo día, pendientes sin cambio.
- Móvil y movimiento reducido en el flujo principal.

## 11. Orden de trabajo (para el plan)

1. Herramienta `freeze` (#1093) y deuda asociada; tests de #1087 sobre r3.1.
2. Motor r4.1: cadena, `switch` de #1086, fixture, `freeze r4.1`, entrenamiento sobre r4.1.
3. Calibración de cadenas y elección de longitud.
4. Migración en dev: columnas, índices, RPC de concesión y las dos funciones de escritura con
   el bloqueo; matriz SQL, incluida la concurrencia con dos conexiones; `data-model.md`.
5. Catálogo, `rewardOrder` y `pickReward`.
6. Servicio, repositorio y server actions.
7. Cliente: sección, panel, reanudación, celebración, i18n.
8. E2E y verificación con dos cuentas; build de producción.
9. Prod: migración aplicada y verificada contra objetos reales; doc y backlog; entradas en
   `decisiones.md`; issues de R4b y de la migración de ids.

## 12. Definición de hecho

- `data-model.md` §8bis.5 con las tres columnas, los tres índices, la RPC de concesión, las dos
  funciones de escritura y la clave del bloqueo consultivo (primer uso en el repo), fecha de
  verificación en dev y prod.
- `docs/requirements/backlog.md`: R4a marcada; R4b como casilla propia.
- `decisiones.md`: desdoble R4a/R4b; interpretación de «no caducan»; arrastre de vida; reintento
  desde el principio; log parcial local.
- Parte II de la hoja de ruta: R4 desdoblada, R4a con contrato, R4b con contrato heredado.
- `docs/architecture/graph.json`: nodo de aventuras, arista a `m-pet-battle`, trampa de los
  reexports de `versions/` (#1093).
- Issues cerradas: #1086, #1087, #1093. Issues abiertas: R4b; migración de ids si aplica; lo que
  se descubra de refilón.
