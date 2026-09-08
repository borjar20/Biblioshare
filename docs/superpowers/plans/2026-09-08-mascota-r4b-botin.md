# Mascota R4b — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. La ejecución secuencial es la opción por defecto; no lanzar agentes salvo autorización o instrucciones aplicables.

**Goal:** Activar los seis objetos de R4a como copias de potencia fija equipables, conservando el vínculo entre oportunidades de botín y actividad cultural.

**Architecture:** El histórico de aventuras ganadas identifica las copias; una tabla guarda solo la selección de equipo. SQL concede una sola recompensa por día de aventura y captura el equipo al crear el combate. El motor puro r4.2 consume esa foto inmutable y conserva ejecutables y replays anteriores.

**Tech Stack:** TypeScript, Next.js 16.3.0 / React 19, Supabase Postgres, next-intl, Vitest, Playwright y PixelLab; Node 22.23.1 según README. No requiere nuevas dependencias.

**Spec:** `docs/superpowers/specs/2026-09-08-mascota-r4b-botin-design.md`.

**Estado:** ejecución secuencial iniciada el 2026-09-08. Tarea 1 verificada: 21 tests de botín verdes con Node 22.23.1; tareas siguientes abiertas. Base inspeccionada: `cbf9d65e` más commits documentales `109ff258` y `88374ad7`. Seguimiento #1123; tinta y desencantado aplazados en #1134.

## Restricciones globales

- Una recompensa por aventura vinculada a actividad cultural. Repetir combates no da más copias ni vuelve a sortear la calidad. Entrenamiento sin recompensa.
- La potencia se fija al obtener la copia. La tinta no la mejora; no implementar tinta, desencantado, saldo, tienda, mejoras de ranura ni atributos comprados.
- Se conservan los seis ids de catálogo, sus ranuras, XP, nivel visible, etapas y concesión de siete días de R4a.
- Equipar gratis desde la ficha para el próximo combate. Reanudar mantiene el snapshot; un reintento tras derrota toma el equipo nuevo.
- Motores, manifiestos y fixtures publicados r2.2/r3.1/r4.1 inmutables. Nunca editar una versión vieja para hacer pasar tests actuales.
- Sin `use cache` en datos privados. Servidor autenticado y SQL validan posesión; ningún payload cliente decide potencia, resultado o recompensa.
- Migraciones en dev primero; verificar objetos y grants reales. Producción requiere el gate de publicación de la tarea 11, no queda autorizada por pedir este plan.
- Leer README, grafo, `data-model.md`, `docs/TESTING.md`, `docs/UI-GLOSARIO.md` y guías pertinentes de `node_modules/next/dist/docs/` antes de código. Para APIs y CLI, consultar Context7 y skills aplicables al ejecutar.
- Los sprites nuevos de `public/pet/` se generan con PixelLab siguiendo la spec canónica y las instrucciones de `pet-artist`. Sin arte provisional en el cierre.
- No incorporar cambios ajenos ya preparados. No crear otro worktree por costumbre; no borrar el worktree R4a existente sin comprobar su propiedad/estado. Limpiar solo servidores y recursos de esta ejecución.

## Contratos técnicos de este plan

Estas elecciones concretan la propuesta para ejecutarla; **los valores numéricos son candidatos de calibración**, no resultados medidos ni decisiones atribuidas al usuario.

1. **Calidad candidata:** cinco valores `8000, 9000, 10000, 11000, 12000` en puntos básicos (×0,8 a ×1,2). Afectan solo al efecto adicional del objeto, nunca al daño básico, atributos o nivel. Cada escalón debe producir una diferencia efectiva comprobable; revisar valores antes de congelar si el redondeo borra diferencias.
2. **Copias antiguas:** calidad neutral `10000` en la proyección, sin actualizar sus recompensas ni digests. Una copia corresponde al UUID de la fila ganada de `pet_battles`; cambiar el catálogo no cambia esa identidad.
3. **Copias nuevas:** `reward = { itemId, slot, qualityBp, qualityVersion: 1 }`. La fila de batalla aporta el id de copia. No añadir tabla de inventario ni consolidar copias con la misma calidad.
4. **Calidad estable por oportunidad:** SQL obtiene un índice determinista de `(user_id, adventure_day, 'pet-quality-v1')`, nunca del número de intento, inventario actual ni seed nuevo del reintento. Elegir cinco intervalos equiprobables salvo sesgo de módulo despreciable sobre 32 bits. La fórmula no es un secreto ni una prueba de autoridad; la autoridad está en las escrituras y la concesión limitada por día.
5. **Selección:** `pet_loadout(user_id PK, weapon_battle_id uuid nullable, amulet_battle_id uuid nullable, updated_at timestamptz)`. Referencias a `pet_battles.id`; ownership, victoria y ranura validados en SQL. Null es ranura vacía, ausencia de fila es equipo vacío.
6. **Snapshot r4.2:** `equipment: { weapon: EquippedCopy | null, amulet: EquippedCopy | null }`, donde `EquippedCopy = { copyId: string, itemId: LootItemId, qualityBp: number }`. Validación cerrada por versión; el replay no consulta el inventario actual.
7. **Concurrencia:** conservar el bloqueo consultivo `(20260908, hashtext(user_id::text))` y ampliar explícitamente su ámbito a equipo e inicio de entrenamiento. Una transacción captura selección y crea combate. La última escritura serializada gana al equipar; la UI recibe la selección persistida.

```ts
// Interfaces nuevas de aplicación: src/lib/pet/loot/types.ts
export interface LootCopy {
  copyId: string; itemId: LootItemId; slot: LootSlot;
  qualityBp: number; acquiredAt: string;
}
export interface PetLoadout {
  weapon: LootCopy | null; amulet: LootCopy | null;
}
export type LoadoutResponse =
  | { ok: true; loadout: PetLoadout }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_SLOT" |
      "INVALID_COPY" | "NOT_OWNED" | "WRONG_SLOT" | "UNAVAILABLE" };
```

Los tipos equivalentes del motor se definen dentro de `versions/r4.2/`; sus imports de ejecución no pueden salir de la versión. Los tipos de filas históricas de servicios deben representar snapshots antiguos sin `equipment`, con narrowing por versión, no fingir que todos son r4.2.

## Mapa de archivos y dependencias

| Área | Archivos | Responsabilidad |
|---|---|---|
| Copias | `src/lib/pet/loot/{types,copies}.ts`, `catalog.ts`, `reward.ts` | Identidad, proyección compatible, calidad validada; mantener sorteo de tipo |
| Motor | `src/lib/pet/battle/versions/r4.2/`, `replay.ts`, reexports actuales | Efectos puros, versión y validación histórica |
| Medición | `scripts/pet-battle/calibrate-loot.ts`, `docs/testing/2026-09-08-r4b-balance.md` | Matriz reproducible de builds, calidad y políticas |
| Persistencia | nueva migración `pet_r4b_equipment` creada por CLI, `supabase/tests/pet_r4b_equipment.sql` | Calidad, selección e inicios atómicos, permisos |
| Servicios | `src/lib/pet/loot/{repository,service,actions}.ts`, `adventure/{repository,service,types}.ts`, `training/{repository,service,types}.ts` | Capa autenticada, copias completas e inicios |
| Interfaz | `src/components/pet/loot/`, `adventure/{inventory-list,adventure-panel,adventure-section}.tsx` | Selección y comparación por copia |
| Combate visual | `training/training-session.ts`, `training-effects.ts`, `training-panel.tsx`, `training.module.css` | Reanudar las cuatro versiones y efectos legibles |
| Arte | `public/pet/loot/`, `src/lib/pet/loot/art.ts` | Seis iconos y VFX seleccionados |
| Pruebas | `e2e/mascota-equipo.spec.ts`, autoridad y regresiones existentes | Flujo real y aislamiento con dos cuentas |

Orden: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. No publicar cambios intermedios: algunos commits son piezas internas aún no conectadas.

### Tarea 1: Proyección de copias y compatibilidad de recompensas

**Archivos:** crear `src/lib/pet/loot/types.ts`, `copies.ts`, `copies.test.ts`; modificar `catalog.ts` solo para aceptar y validar las dos formas de recompensa. Conservar `rewardOrder`, `pickReward` y los ids existentes.

**Interfaces:** consume filas `{ id, reward, resolved_at }`; produce `copyFromWin(row): LootCopy | null` y `isQualityBp(value: unknown): value is number`. La forma moderna exige `qualityVersion: 1` y calidad del conjunto cerrado; la antigua no lleva ninguno de ambos campos. Campos parciales o versiones desconocidas se rechazan, no se normalizan silenciosamente.

- [x] Escribir casos: copia antigua a 10000, nueva a 12000, ids de fila distintos conservados, calidad 9999/NaN/string rechazada, ranura falsa rechazada. Test mínimo:

```ts
expect(copyFromWin({ id: "a", resolved_at: "2026-09-07T12:00:00Z",
  reward: { itemId: "sharp_bookmark", slot: "weapon" } })?.qualityBp).toBe(10000);
expect(copyFromWin({ id: "b", resolved_at: "2026-09-08T12:00:00Z",
  reward: { itemId: "sharp_bookmark", slot: "weapon", qualityBp: 9999,
    qualityVersion: 1 } })).toBeNull();
```

- [x] Ejecutar `npx vitest run src/lib/pet/loot/copies.test.ts`; esperar fallo por export ausente, después implementar validadores/proyección y obtener verde.
- [x] Correr `npx vitest run src/lib/pet/loot` y comprobar que el sorteo de tipo anterior conserva resultados.
- [x] Commit solo de estos archivos: `feat(pet): represent immutable loot copies`.

### Tarea 2: Motor candidato r4.2 y seis efectos

**Archivos:** crear `versions/r4.2/` mediante `npm run pet:battle -- fork r4.1 r4.2`; editar allí `types.ts`, `content.ts`, `snapshot.ts`, `engine.ts`; crear `equipment.ts`, `src/lib/pet/battle/equipment.test.ts`. No apuntar todavía los reexports al candidato.

**Interfaces:** consume snapshot con `equipment`; produce `isEquipment(unknown): boolean`, `scaleLootEffect(base: number, qualityBp: number): number`, y evento `LOOT_EFFECT { itemId, copyId, effect: 'damage'|'shield'|'heal'|'cooldown'|'vulnerability', amount: number }`, con seq/tick como los demás eventos. `amount` es magnitud aplicada efectiva (daño/vida recortado a lo que queda, duración en ticks).

- [ ] Test rojo del escalado; implementar con enteros y protección frente a overflow (BigInt intermedio y salida segura):

```ts
expect(scaleLootEffect(10, 8000)).toBe(8);
expect(scaleLootEffect(10, 12000)).toBe(12);
expect(isEquipment({ weapon: { copyId: "x", itemId: "loan_pendant",
  qualityBp: 10000 }, amulet: null })).toBe(false); // ranura falsa
```

- [ ] Añadir casos al motor para cada efecto y su ausencia. Interrupción: bonus sobre daño de interrupción; pluma: bonus sobre la parte de Potencia proporcional a aciertos; lupa: extensión al entrar en vulnerable; amuleto: barrera al usar ulti incluida omitida; colgante: menor recarga solo en interrupción; medallón: cura limitada al empezar tramos 2/3, sin revivir. Primer tramo empieza lleno y no produce cura ficticia.
- [ ] Implementar los candidatos de §3 de la spec. Aplicar calidad a la bonificación antes del redondeo final cuando sea posible; multiplicar con racionales enteros, evitando que truncar dos veces o escalar `hpMax` cambie el efecto previsto. Escribir aserciones numéricas para 8000/10000/12000 por objeto con un fixture de hp/atk fijo.
- [ ] Emitir `LOOT_EFFECT` solo si hubo efecto real. No introducir RNG de combate para botín, ni retrasar KO para mostrar VFX. Respetar el orden del tick y que curas/reinicios no se repitan al reconstruir una sesión.
- [ ] Ejecutar `npx vitest run src/lib/pet/battle/equipment.test.ts src/lib/pet/battle/tick-order.test.ts src/lib/pet/battle/chain.test.ts`; rojo→verde. Añadir fixture equipo vacío comparado con r4.1 en resultados y eventos de combate equivalentes.
- [ ] Commit: `feat(pet): implement candidate r4.2 loot effects`.

### Tarea 3: Calibración reproducible de calidad y builds

**Archivos:** crear `scripts/pet-battle/calibrate-loot.ts`, su test `calibrate-loot.test.ts`, `docs/testing/2026-09-08-r4b-balance.md`; leer políticas/perfiles/calibración existentes. Ajustes numéricos solo dentro de r4.2.

**Interfaces:** script ejecutable `node --import tsx scripts/pet-battle/calibrate-loot.ts`; exporta `buildCases()` y `measureLootCases(seeds: number[]): Promise<LootMetric[]>`, con `LootMetric = { profile: string; scenario: string; weapon: string|null; amulet: string|null; weaponQuality: number|null; amuletQuality: number|null; policy: string; wins: number; samples: number; meanHp: number; meanTicks: number }`.

- [ ] Test de matriz: vacío + 3 armas × 5 calidades y vacío + 3 amuletos × 5 calidades = **256** selecciones. No limitarse a 16 combinaciones de ids ni probar siempre ambas ranuras con la misma calidad.

```ts
expect(buildCases()).toHaveLength(256);
expect(buildCases().some(c => c.weaponQuality === 8000 && c.amuletQuality === 12000)).toBe(true);
```

- [ ] Implementar barrido sobre los seis perfiles, Brote y Coraza individuales, ocho cadenas posibles de tres enemigos y cadenas sorteadas del baseline. Usar seeds 0–199 para calibrar y 200–399 para comprobar, desde `seedFromIndex`. Procesar secuencialmente y escribir resultados por lotes sin retener todos los eventos.
- [ ] Incluir `never`, `spam`, `interrupt_ulti` existentes y política `vulnerability_ulti` que espera vulnerable para skill/ulti, interrumpe windup y no pulsa durante guardia. Crear inputs mediante las recetas generadas por seed/tick del candidato, no asumir un orden constante.
- [ ] Mantener para equipo vacío el baseline de R4a (56–60 % observado en su muestra, criterio 50–75 %; never ≤3 %). Medir por separado todas las builds; detectar dominancia entre tipos a igual calidad, no confundir que una copia de mayor calidad supere a otra del mismo objeto con un fallo. Ningún objeto debe carecer de un escenario útil.
- [ ] Documentar datos reales y ajustar candidatos hasta que cada objeto tenga efecto comprobable y no haya una build superior en todos los escenarios. Si eso exige alterar las seis direcciones acordadas o convertir el equipo en progresión ilimitada, parar la publicación y registrar la decisión en #1123.
- [ ] Tests: `node --import tsx --test scripts/pet-battle/calibrate-loot.test.ts`; repetir medición solo tras cambios numéricos. Commit: `test(pet): calibrate loot quality and build tradeoffs`.

### Tarea 4: Publicar internamente r4.2 preservando la historia

**Archivos:** `battle/replay.ts`, reexports `battle/*.ts`, `versions/r4.2/{normative.json,manifest.json}`, `versions/README.md`; crear `r4b-normative.test.ts`; modificar `releases.test.ts`, `purity.test.ts` y `scripts/pet-battle/simulate.ts` para un snapshot normativo con equipo.

**Interfaces:** `getBattleRelease` conserva versión+hash. Tipos de frontera representan snapshots/resultados/eventos de las versiones publicadas; el narrowing ocurre en el adaptador de versión. No convertir un snapshot antiguo en r4.2 agregándole equipo vacío antes del digest.

- [ ] Añadir prueba roja: r2.2/r3.1/r4.1 siguen resolviendo con sus fixtures; snapshot r4.2 exige `equipment`; versión/hash desconocidos siguen dando `UNKNOWN_RELEASE`.
- [ ] Corregir dependencia histórica detectada: la entrada r2.2 usa hoy el guard `isBattleSnapshot` del export actual. Apuntarla a la validación histórica compatible (r3 conserva la forma anterior) o a un adaptador fuera de versiones congeladas que valide exactamente la forma r2.2; probar su fixture antes de mover los reexports.
- [ ] Añadir r4.2 al registro, actualizar reexports y el CLI para crear equipo vacío o fixture equipado conforme a la nueva forma. Mantener imports de ejecución de r4.2 dentro de la carpeta.

```sh
npm run pet:battle -- golden --version r4.2 --chain 3
npm run pet:battle -- freeze r4.2
npm run test:pet:battle
git diff --exit-code cbf9d65e -- src/lib/pet/battle/versions/r2.2 src/lib/pet/battle/versions/r3.1 src/lib/pet/battle/versions/r4.1
```

- [ ] Fixture normativo con efectos efectivos y tests adicionales que cubran los otros cuatro objetos. `freeze` después del último ajuste, nunca regenerar manifiestos antiguos.
- [ ] Commit: `feat(pet): register r4.2 without changing historical battles`.

### Tarea 5: Migración de calidad, equipo e inicios atómicos

**Archivos:** crear migración con `supabase migration new pet_r4b_equipment` (usar el nombre devuelto, no inventar timestamp); `supabase/tests/pet_r4b_equipment.sql`; actualizar `bootstrap/manifest.json`, baseline y `src/lib/supabase/database.types.ts`.

**Interfaces SQL:** `set_pet_equipment(p_user uuid,p_slot text,p_copy uuid)` devuelve fila de `pet_loadout`; `private.pet_equipment_snapshot(p_user uuid)` devuelve JSON de las dos ranuras; `start_pet_training(p_user uuid,p_intent uuid,p_seed text,p_enemy text,p_ruleset_version text,p_content_hash text,p_snapshot jsonb)` devuelve `setof pet_battles`. Modificar mediante nueva migración las definiciones de `start_pet_adventure`/`resolve_pet_adventure` preservando sus firmas. Todas las escrituras públicas solo con EXECUTE para service_role; helpers sin permisos de API.

- [ ] Matriz roja de tabla ausente y funciones ausentes. Crear tabla con FK a usuario, FKs de copias, RLS, SELECT propio para authenticated; escrituras directas solo service_role. No UPDATE directo para authenticated. CHECKs de ranura se aplican en la función junto a validación de victoria, ownership e id.
- [ ] Fórmula candidata de calidad, helper estable con versión en su nombre. Es un hash determinista, no seguridad criptográfica del botín:

```sql
-- Índice 0..4; las columnas ya son uuid/date tipadas.
8000 + 1000 * (
  (('x' || substr(md5(p_user::text || ':' || to_char(p_day, 'YYYY-MM-DD')
    || ':pet-quality-v1'), 1, 8))::bit(32)::bigint) % 5
)
```

- [ ] En resolver: tomar bloqueo existente, devolver fila resuelta antes de cualquier cálculo, conservar primer no poseído y fallback. Para nuevas victorias r4.2 anexar calidad/versión calculadas desde día guardado. Las anteriores mantienen forma `{itemId,slot}` y proyección a 10000. Validar que la permutación recibida contiene exactamente los seis ids/ranuras, sin confiar en calidad del parámetro.
- [ ] En equipar: bajo el mismo bloqueo leer fila de copia ganada del dueño, validar ranura y actualizar solo la ranura solicitada. `p_copy = null` vacía la ranura; id ajeno/inexistente produce `NOT_OWNED`. Id existente de otra ranura produce `WRONG_SLOT`. Sin fila propia crear ambas ranuras vacías antes de actualizar una.
- [ ] En ambos inicios: bajo bloqueo devolver intención/intento existente primero; para fila nueva r4.2 sobrescribir `p_snapshot.equipment` con helper SQL, nunca usar selección enviada. `start_pet_training` conserva la idempotencia por `(user_id,intent_id)` y tipo training. Reintento de aventura sigue usando el día anterior y no crea otra oportunidad de botín.
- [ ] Pruebas SQL: segunda resolución con distinto payload devuelve recompensa idéntica; dos victorias del mismo día imposibles; misma calidad entre intentos; antiguas intactas; INSERT/UPDATE/EXECUTE denegados a roles no autorizados. Con dos conexiones comprobar equipar/iniciar en ambos órdenes y dos resoluciones concurrentes. Usar transacciones y usuarios de fixture desechables.
- [ ] Ejecutar receta de `docs/testing/supabase-local.md`, registrar migración, `npm run db:baseline`, `npm run test:db:bootstrap`; aplicar y verificar también dev con matriz SQL. Añadir tabla/funciones a `data-model.md` con fecha/entorno real y correr superficie 6 de `docs/DRIFT-CHECK.md`, anotando que authenticated tiene solo lectura aquí.
- [ ] Commit: `feat(pet): persist loot quality and atomic equipment selection`.

### Tarea 6: Servicios autenticados y lectura íntegra de copias

**Archivos:** crear `loot/{repository,service,actions}.ts`, `service.test.ts`; modificar `adventure/{repository,service,types}.ts`, `training/{repository,service,types}.ts`, sus actions y pruebas; `src/lib/reactivity/revalidate.ts` si requiere reutilización.

**Interfaces:** `setPetEquipment(slot: LootSlot, copyId: string|null): Promise<LoadoutResponse>`; `getPetLoadout(): Promise<PetLoadout>` autenticada; repositorio acotado a usuario con `equip(slot,copyId)`, `loadout()`, `copies()`. `AdventureState.inventory` pasa a `LootCopy[]`; `wins()` conserva todos los días ganados y añade id/fecha necesarios.

- [ ] Test rojo de servicio: usuario ausente, UUID inválido, ranura desconocida, error de repositorio y éxito devuelven el código discriminado correcto. UI nunca envía qualityBp. Tras éxito revalidar `/mascota`; fallo conserva estado anterior.

```ts
// En prueba con repositorio falso cuyo equip rechaza la copia ajena:
expect(await service.equip("weapon", otherUserCopyId))
  .toEqual({ ok: false, code: "NOT_OWNED" });
expect(repo.current.weapon?.copyId).toBe(previousCopyId);
```

- [ ] Implementar acciones autenticadas siguiendo las existentes de training/adventure, sin leer service_role en cliente. Traducir códigos SQL conocidos; errores inesperados a `UNAVAILABLE` con log servidor sin secretos.
- [ ] Cambiar lectura de wins/copias: paginar PostgREST explícitamente en lotes de 500 ordenados por id hasta terminar. Un SELECT sin limit explícito sigue teniendo el límite de API; probar 1001 victorias y que `wonDays` y copias antiguas no se pierdan. Ningún truncado silencioso.
- [ ] Adaptar inicio de entrenamiento a RPC atómica y comprobar que el servicio utiliza el snapshot **devuelto**, no el previo al RPC. Nuevos snapshots base pueden usar equipo vacío para validar stats antes de SQL; el equipo real se inyecta dentro de la transacción. Resolver y replay enrutan por release almacenada.
- [ ] Ejecutar `npx vitest run src/lib/pet/loot src/lib/pet/adventure src/lib/pet/training`; agregar caso cambiar equipo → recuperar intención anterior conserva snapshot y caso entrenamiento no aumenta inventario.
- [ ] Commit: `feat(pet): connect owned loot copies to battle services`.

### Tarea 7: Reanudar las cuatro versiones en el cliente

**Archivos:** `src/components/pet/training/training-session.ts`, `training-session.test.ts`, `src/lib/pet/training/historical.test.ts`.

**Interfaces:** `TrainingSession` mantiene API pública. `buildEngine` añade rama explícita r4.1, además de r2.2/r3.1 y r4.2 actual; snapshot y contentHash deben coincidir con release antes de construir.

- [ ] Test rojo: reanudar fila r4.1 con log parcial mientras actual es r4.2 no lanza `UNSUPPORTED_BATTLE`; resultado coincide con simulación r4.1. El código actual solo diferencia r2.2, r3.1 y «actual», por eso esta tarea es necesaria.
- [ ] Añadir imports explícitos a r4.1/engine y content; adaptar sus vistas/eventos sin agregar equipo al snapshot histórico. Para r4.2 usar equipo guardado y rechazar calidad corrupta. Mantener versión+hash como selector, no solo nombre.
- [ ] Casos de sesión: cambiar selección desde otra pestaña, recargar en interludio y reanudar con mismo equipo; cura del medallón una sola vez; log corrupto reconstruye desde cero sin volver a cobrar botín; volver a intentar tras derrota toma copia nueva.
- [ ] Ejecutar `npx vitest run src/components/pet/training/training-session.test.ts src/lib/pet/training/historical.test.ts`; commit `fix(pet): preserve r4.1 resume after equipment release`.

### Tarea 8: Inventario, comparación y selección

**Archivos:** crear `src/components/pet/loot/{equipment-panel,loot-comparison}.tsx` y tests; actualizar `adventure/{inventory-list,adventure-panel,adventure-section}.tsx`, `messages/es.json`; usar glosario y tokens actuales.

**Interfaces:** `EquipmentPanel({ copies: LootCopy[], initial: PetLoadout })`; `LootComparison({ equipped: LootCopy|null, candidate: LootCopy })`. Servidor aporta inventario/selección; acción de tarea 6 escribe; selección de candidato es local, equipo efectivo confirmado es servidor.

- [ ] Prueba roja de dos copias del mismo id con distinta potencia: ambas visibles y seleccionables por `copyId`; comparar muestra valores efectivos y multiplicador, nunca solo «x2 copias». Mostrar alternativa vacía y botón quitar por ranura.
- [ ] Implementar selección por tipo de objeto y listado de sus copias, con potencia descendente y desempate id, sin eliminar las inferiores. Seis grupos evitan una pared de tarjetas; cada grupo permite expandir sus copias. Sin controles de tinta/desencantado. Comparación de efectos distintos usa descripción completa, no un puntaje inventado.

```ts
// Contrato accesible a usar en la prueba y el componente.
expect(screen.getByRole("button", { name: "Equipar esta copia" })).toBeEnabled();
await user.click(screen.getByRole("button", { name: "Equipar esta copia" }));
expect(equipAction).toHaveBeenCalledWith("weapon", candidate.copyId);
```

- [ ] Durante envío deshabilitar escritura del control; ante error mantener equipo anterior, explicar y permitir reintento. Actualizar desde respuesta confirmada y refrescar ruta; rehidratar props al refrescar. Texto para aventura abierta: «El equipo nuevo se usará en tu próximo combate. Esta aventura conserva el equipo con el que empezó».
- [ ] Tras victoria seleccionar la copia recién concedida para comparar; no equipar automáticamente. Estados sin mascota, sin objetos, ranura vacía y fallo de lectura separados. Seguir degradación de AdventureSection sin ocultar la ficha completa.
- [ ] Probar teclado, foco, móvil y traducciones. Ejecutar `npx vitest run src/components/pet/loot src/components/pet/adventure`; commit `feat(pet): compare and equip individual loot copies`.

### Tarea 9: Iconos PixelLab y VFX basados en eventos

**Archivos:** crear `src/lib/pet/loot/art.ts`, `art.test.ts`, assets `public/pet/loot/{sharp_bookmark,heavy_ink_quill,librarian_loupe,last_page_amulet,loan_pendant,streak_medallion}.png`; VFX en `public/pet/loot/fx/` con manifiesto; modificar `training-effects.ts`, su test, `training-panel.tsx` y CSS.

**Interfaces:** `LOOT_ART` mapea cada id a icono y efecto; `lootEffectsForTick(events: readonly BattleEvent[])` devuelve eventos LOOT_EFFECT del tick visible. No ejecutar efectos durante reconstrucción de logs, solo al avanzar/reproducir ese tick.

- [ ] Leer `.claude/agents/pet-artist.md` y spec canónica; comprobar PixelLab callable/saldo antes de generar. Si la sesión no expone PixelLab, resolver acceso o dejar tarea abierta en #1123; no sustituir herramienta ni declarar arte listo. Usar agente pet-artist si está disponible según instrucciones del proyecto.
- [ ] Generar seis iconos 64×64 transparentes, paleta cálida, silueta reconocible: marcapáginas afilado, pluma de tinta pesada, lupa, amuleto de página, colgante de préstamo, medallón de racha. Candidatos y hoja de contacto en `.superpowers/brainstorm/2026-09-08-r4b/`; solo elegidos en public. Registrar ids y coste real.
- [ ] Generar VFX breves para daño, barrera, cura, recarga y vulnerabilidad, reutilizando el mismo efecto visual entre copias de calidad distinta. Validar transparencia, frames y tamaño; no modificar sheets/cajas de la compañera.
- [ ] Test rojo de evento concurrente: un STATUS_APPLIED posterior no oculta LOOT_EFFECT del mismo tick. Implementar extracción por tick completo y texto accesible con nombre/efecto; reduced-motion suprime animación conservando feedback.

```ts
expect(lootEffectsForTick([lootEvent, statusEvent])).toEqual([lootEvent]);
```

- [ ] Test del manifiesto exige asset existente por cada id, dimensiones/alpha correctos y archivos VFX válidos. Verificar en `/mascota` y replay. Commit `feat(pet): add loot icons and readable combat effects`.

### Tarea 10: Verificación completa con dos cuentas

**Archivos:** crear `e2e/mascota-equipo.spec.ts`; ampliar `e2e/mascota-batallas-autoridad.spec.ts`; conservar `mascota-aventuras.spec.ts`; `e2e/support/battle-users.ts` solo si faltan helpers; evidencia `docs/testing/2026-09-08-r4b-verificacion.md`.

**Interfaces:** helpers siembran victorias/copies de prueba por API servidor en entorno desechable; nunca simular un PASS de autoridad mediante mocks de la RPC. Testids propuestos `pet-equipment`, `loot-copy-<uuid>`, `loot-comparison`.

- [ ] Test de flujo: sembrar copia legacy y moderna, entrar, comparar/equipar, empezar entrenamiento, comprobar snapshot real, usar efecto, terminar y verificar que inventario no aumenta. Copia antigua sigue a 10000 y no se reescribe.
- [ ] Test de aventura: ganar con usuario con actividad → una copia; resolver otra vez con payload diferente conserva calidad/id; repetir no da otra recompensa del día; perder y reintentar otro día conserva calidad determinada para esa oportunidad. Dos conexiones/pestañas compiten por equipar/iniciar y resolver; observar filas finales reales.
- [ ] Test privacidad: segunda cuenta no lee equipo/recompensa ajena ni equipa una copia ajena; anon no ejecuta funciones; no puede falsificar qualityBp desde actions ni PostgREST. Verificar error y selección previa intacta.
- [ ] Test visual/accesible: teclado, ancho 390 px, reduced-motion, copia repetida, error/reintento, interludio, recarga. Capturas de comparación y efecto con datos sintéticos. Limpiar antes y después por API incluso si falla la UI.

```sh
npm test
npx tsc --noEmit
npm run test:ci:lint
npm run build
# Arrancar UNA instancia npm run start en 3000, después:
npm run test:e2e -- e2e/mascota-equipo.spec.ts e2e/mascota-aventuras.spec.ts e2e/mascota-batallas-autoridad.spec.ts
```

- [ ] Registrar comandos, entorno, resultados reales y límites. La build y el start deben usar la misma BD de pruebas con migración; no ejecutar e2e solo contra next dev. Detener servidor al terminar.
- [ ] Solicitar aceptación jugable sobre comparar y querer probar un objeto, sin inventar número de partidas. Si queda una limitación, issue con tres etiquetas antes de cerrar. Commit `test(pet): verify equipment authority and full loot flow`.

### Tarea 11: Documentación, revisión y publicación

**Archivos:** `docs/requirements/{data-model,backlog,decisiones}.md`, Parte II de hoja de ruta, `README.md`, grafo y mapa según `docs/architecture/README.md`, spec y este plan. Seguimiento #1123/#1134.

- [ ] Revisar diff de esquema contra lo aplicado: funciones, RLS, grants y copy ids; anotar alcance extendido de bloqueo. Registrar calidad final, fórmula, proyección legacy y evidencia de balance como decisiones nuevas append-only.
- [ ] Actualizar grafo de concesión→victoria→copia→equipar→snapshot→replay con archivos reales. No marcar todo R4b hecho si falta arte, verificación o aceptación. Tinta permanece pendiente #1134.
- [ ] Crear PR con problema/comportamiento, evidencia, plan de despliegue y rollback. Explicar que no hay caché compartida de datos de usuario. Revisión focalizada de permiso, carrera, compatibilidad y duplicación de recompensas antes de publicar.
- [ ] Con autorización de publicación: aplicar migración aditiva en prod antes del código, verificar definiciones/grants contra objetos reales, desplegar código y smoke no destructivo. La aprobación de este plan por sí sola no autoriza tocar producción.
- [ ] Rollback: volver al código anterior manteniendo migración aditiva y las filas/equipo/quality ya creados; versiones conservadas no se borran. Antes de publicar demostrar que el parser anterior tolera campos extra de recompensa y que funciones vigentes conservan firmas. Si una fila r4.2 abierta no puede reanudarse con el frontend anterior, no presentar rollback total como transparente: conservar el frontend compatible r4.2 o preparar rollback que desactive solo nuevos inicios r4.2.
- [ ] Marcar tareas y backlog según evidencia, enlazar PR y cerrar #1123 únicamente al cumplir el contrato. Limpiar procesos/fixtures propios y mantener cambios ajenos intactos.

## Auto-revisión del plan

| Requisito de spec | Tareas |
|---|---|
| Copias variables; inventario previo intacto | 1, 5, 6, 8 |
| Una recompensa por actividad, no por reintento | 5, 6, 10 |
| Seis efectos con balance y calidad | 2, 3 |
| Selección gratis y snapshot estable | 5, 6, 7, 8 |
| Autoridad y concurrencia | 5, 6, 10 |
| Historia y versiones inmutables | 4, 7, 10, 11 |
| Arte, VFX y accesibilidad | 8, 9, 10 |
| Tinta fuera de alcance | restricciones, 8, 11; #1134 |
| Documentación y publicación verificable | 5, 10, 11 |

No se han ejecutado comandos de build, tests, generación de arte ni migración al escribir este plan. Los tests/snippets son instrucciones para la ejecución, no evidencia de resultados.
