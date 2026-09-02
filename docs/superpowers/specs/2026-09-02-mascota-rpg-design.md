# Mascota RPG: una ardilla que crece con lo que haces en Biblioshare

> **[Histórico · congelado 2026-09-02]** Spec de diseño de la fase 1 de la mascota (núcleo: identidad,
> clases, atributos derivados, humor, arte por capas con rig, compañera flotante y página propia).
> Explica el *porqué* de cada decisión; el estado de hoy manda en el código. Las fases posteriores
> (misiones, avisos push, jefes, PvP) se listan en §10 y viven como issues, no aquí.

## Criterio

**La mascota es un espejo, no una máquina de culpa.** Crece con lo que ya haces en la app, no con
clics inventados para alimentarla. Nunca pierde nivel ni atributos; lo único que baja sin uso es su
humor, y vuelve al entrar. No pide atención espontáneamente: reacciona a lo que acabas de hacer.

**Todo lo derivable se deriva; solo se guarda lo que es una decisión.** XP, atributos, nivel y etapa
se calculan a partir de las tablas que ya existen (`progress_sessions`, `passes`, `notes`, posts de
club…). Se guardan nombre, clase, fecha de eclosión y preferencias. Consecuencias: los usuarios con
historial (407 pases en prod) no empiezan de cero; rebalancear pesos es cambiar un fichero, nadie
pierde nada; no hay ganchos nuevos en cada escritura del dominio (la lección de #459 con las
celebraciones: los ganchos se olvidan).

Decisiones del usuario (2026-09-02, brainstorming con companion visual): combustible = **todo el uso
de la app** (BiblioPlay fuera por ahora); profundidad = **stats + combate** (combate en fase
posterior); decadencia = **humor temporal, sin castigo**; misiones = **diarias + logros** (fase 2);
arte = **pixel art generado con IA y curado**, con más detalle que un 32 px clásico; ubicación =
**compañera flotante global**; clases **clásicas de fantasía**; animación = **rig por partes**;
evolución = **4 etapas**; clase **elegida con sugerencia**. Sin multiclase (cambiar de clase cubre el
caso).

## 1. Identidad y etapas

Una ardilla por usuario (fila única en `pet_state`, PK = `user_id`). El usuario le pone nombre al
eclosionar. Por qué ardilla: color natural = terracota `--accent` de la app; la bellota es huevo y
moneda a la vez.

| Etapa | Cuándo | Qué se ve |
|---|---|---|
| **Bellota** | Fila creada, aún sin actividad posterior a `hatched_at` | Sprite único, sin clase |
| **Cría** | Nivel 1-9 | Cabeza grande, cuerpo mínimo; ya lleva ropa de clase |
| **Adulta** | Nivel 10-39 | Proporciones de referencia (los bocetos del brainstorming) |
| **Veterana** | Nivel 40+ | Canas en la cola, cicatriz o aura; misma ropa |

La eclosión es un flujo de un paso en `/mascota`: nombre + clase sugerida. Un usuario con historial
eclosiona con sus atributos ya derivados y puede salir directamente adulta. Es deliberado: la bellota
no es una espera artificial, es «aún no has elegido».

## 2. Clases y atributos

Seis clases clásicas, seis atributos, cada atributo con una fuente que la app YA mide:

| Atributo | Clase que lo prima | Fuentes (tablas/funciones existentes) |
|---|---|---|
| **FUE** Fuerza | Bárbaro | `progress_sessions.duration_minutes` y páginas avanzadas; episodios vistos |
| **CON** Constitución | Guerrera | días activos, objetivo diario cumplido (`profiles.daily_goal_minutes`), hitos de racha (`STREAK_MILESTONES`) |
| **INT** Inteligencia | Maga | pases terminados, sagas completadas, géneros distintos leídos |
| **SAB** Sabiduría | Clérigo | `notes` (notas y citas), reseñas de pase, valoraciones |
| **CAR** Carisma | Bardo | posts, votos, encuestas creadas, quedadas de club, seguidos |
| **DES** Destreza | Ranger | obras y autores nuevos en la colección, filas importadas (con tope por importación) |

Reglas:

- **Todas las clases suben todos los atributos.** La clase multiplica ×1.5 su atributo primario al
  calcular XP, y fija aspecto y (en fase de combate) jugadas. Un Bárbaro que escribe mucho tendrá SAB
  alta igual.
- **Elección con sugerencia.** Al eclosionar, la app calcula los seis atributos del historial y
  propone la clase del dominante (empate: la primera en el orden de la tabla). El usuario puede
  escoger otra. Sin historial, no hay sugerencia marcada.
- **Cambio de clase** desde `/mascota`, con confirmación. Cambia bonus y look; atributos intactos
  (son derivados, no hay nada que perder). Sin coste en fase 1; si algún día hay economía, el coste se
  decide entonces.
- `pet_state.class` es `text`, no enum: añadir una clase no exige migración de tipo (mismo criterio
  que `user_celebrations.event_type`). Los valores válidos los fija `src/lib/pet/classes.ts`.
- **BiblioPlay no alimenta ningún atributo** en esta fase. Queda issue (`tipo:feature`, P3) con las
  tres opciones barajadas: caer en DES, séptima clase Pícaro con atributo SUERTE, o dar objetos de
  combate en vez de atributo.

## 3. XP, nivel y balance (derivados)

`src/lib/pet/balance.ts` es el único sitio con números:

```ts
export const BALANCE = {
  FUE: { perTenMinutes: 1, perTenPages: 1, perEpisode: 3 },
  CON: { perActiveDay: 2, perDailyGoalDay: 5, perStreakMilestone: 20 },
  INT: { perFinishedPass: 10, perCompletedSaga: 25, perDistinctGenre: 5 },
  SAB: { perNote: 3, perQuote: 3, perReview: 8, perRating: 1 },
  CAR: { perPost: 3, perVote: 1, perPoll: 5, perEvent: 5, perFollow: 2 },
  DES: { perNewWork: 2, perNewAuthor: 1, perImportedRow: 1, importedRowCap: 50 },
  classBonus: 1.5,
  level: { divisor: 50 }, // nivel = floor(sqrt(xp / divisor)) + 1
  stages: { adult: 10, veteran: 40 },
} as const;
```

- Por sesión, FUE toma el **máximo** entre minutos/10 y páginas/10, no la suma: una sesión con ambos
  datos no cuenta doble.
- `deriveAttributes(counts: PetCounts): PetAttributes` es **pura**: recibe contadores y devuelve los
  seis atributos. Los tests viven sobre ella.
- `xpFor(attributes, cls)` aplica el bonus de clase y suma. `levelFor(xp)` y `stageFor(level,
  hatched, hasActivitySinceHatch)` son puras y triviales.
- La curva es raíz cuadrada: los primeros niveles llegan rápido (cría corta), veterana exige
  volumen real. Con el divisor 50, nivel 10 son 4 050 XP y nivel 40 son 76 050. **Se calibra contra
  los tres usuarios reales de prod antes de cerrar la fase**: la spec fija la forma de la curva, no
  los números finales. Si el usuario más activo no llega a adulta, el divisor está mal.

## 4. Humor

Cuatro estados por días desde la **última actividad global**, con la definición que ya usa la racha
global (`getStreaks`: sesiones ∪ finales de pase) ampliada con acciones sociales (post, voto, encuesta,
quedada). «Hoy» en `Europe/Madrid`, la convención de `club_rounds` y de la RPC del widget. No se
introduce una cuarta definición de día.

| Humor | Días sin actividad | Cara | Idle |
|---|---|---|---|
| contenta | 0 | sonrisa, rubor | balanceo normal, parpadeo |
| normal | 1 | neutra | balanceo normal |
| dormida | 2-3 | ojos cerrados | respira lento, sin cola |
| triste | 4+ | cejas caídas | quieta, solo parpadeo |

El humor **solo** cambia la capa cara y la animación. Atributos, nivel y etapa no se tocan nunca.

## 5. Arte: capas y rig por partes

**Formato.** Pixel art sobre lienzo 40×40, servido a 2× (80 px) en `/mascota` y a 1× (40 px) como
compañera. `image-rendering: pixelated`. Sin degradados; paleta de la app (papel crema, terracota,
tinta) más una paleta corta por clase.

**Piezas y capas.** La ardilla no es un sprite, es un conjunto de piezas con pivote:

| Capa | Piezas | Se pega a | Cuántas |
|---|---|---|---|
| base | cabeza, cuerpo, cola, mano | — | 4 piezas × 3 etapas + bellota |
| cara | contenta, normal, dormida, triste, parpadeo | cabeza | 5 (comunes a todas las clases) |
| ropa (clase) | una imagen | cabeza o cuerpo (lo declara la clase) | 6 clases × 3 etapas |
| accesorio (clase) | una imagen | mano | 6 clases × 3 etapas |

Total del arte de fase 1: 13 piezas base + 5 caras + 36 imágenes de clase. Un cosmético futuro es una
imagen más con su `anchor`; nunca exige redibujar la ardilla.

**Por qué rig y no frames.** Se compararon tres formas de animar capas en el companion visual:
cuerpo rígido (todo se mueve como un bloque; barato pero muerto), frames por capa (sprite sheet
clásico; coste = clases × capas × animaciones × frames, y la IA falla manteniendo coherencia entre
frames) y rig por partes. El rig gana porque **una animación se define una vez y vale para las seis
clases y para cualquier cosmético futuro**, y porque a la IA se le piden PNG estáticos, que es lo
que sabe hacer.

**Manifiesto.** `src/lib/pet/manifest.ts`, tipado, es la fuente de verdad de qué imagen va dónde:

```ts
export const PET_MANIFEST = {
  stages: {
    adult: {
      head:  { src: "/pet/adult/head.png",  pivot: [15, 25], z: 3 },
      body:  { src: "/pet/adult/body.png",  pivot: [15, 35], z: 2 },
      tail:  { src: "/pet/adult/tail.png",  pivot: [27, 33], z: 1 },
      hand:  { src: "/pet/adult/hand.png",  pivot: [11, 27], z: 4 },
      anchors: { hat: [15, 10], torso: [15, 29], hand: [11, 27] },
    },
    // cría y veterana: mismas claves, otros pivotes
  },
  classes: {
    wizard: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    // …
  },
} as const;
```

Pivotes y anclas en coordenadas del lienzo 40×40. Un test recorre el manifiesto y comprueba que
existe cada fichero en `public/pet/` para toda combinación clase × etapa × capa: que falte una pieza
en prod se caza en CI, no mirando la app.

**Animaciones.** Solo CSS (`transform` sobre cada pieza, `transform-origin` = pivote): idle,
parpadeo, alegría (reacción), dormida, triste, evolución (destello + cambio de etapa). Con
`prefers-reduced-motion` se degrada a cuerpo rígido: solo parpadeo, sin balanceo. El componente
`<PetSprite stage class mood size />` compone piezas y capas a partir del manifiesto; nadie más
sabe de PNG.

**Brief de IA.** Se documenta en `docs/superpowers/specs/` junto a esta spec cuando se genere: una
petición por pieza base y etapa, sobre lienzo 40×40 con el pivote marcado, y una por capa de clase
sobre la misma base como referencia. Los sprites procedurales del brainstorming
(`.superpowers/brainstorm/`, no versionado) sirven de referencia de proporciones y paleta.

## 6. Compañera flotante

- Vive en el shell autenticado (`app-shell.tsx`), esquina inferior derecha, 40 px, por encima de la
  barra inferior móvil. **No** aparece en rutas públicas ni en las de pantalla completa
  (`isFullscreenRoute`, hoy `/partida`), ni cuando `pet_state` no existe (sin bellota flotante: la
  eclosión se descubre desde el menú «Tú», no desde un huevo que persigue).
- **Reacciona por el canal de celebraciones.** Cada evento que hoy gana una fila en
  `user_celebrations` (primera actividad del día, objetivo diario, hito de racha, primera
  participación) hace que la ardilla salte y muestre un bocadillo de una línea. Es un consumidor
  más del modelo ganar → drenar; no se toca ni la RPC ni la tabla. Se añaden dos eventos al
  registro: `pet_level_up` y `pet_evolved` (§8).
- Tap abre `/mascota`. Se oculta desde ajustes con `pet_state.companion_hidden`, en base de datos y
  no en localStorage (lección de #460: las preferencias en localStorage no cruzan dispositivos).
- Cero ruido: sin bocadillos espontáneos, sin «te echo de menos» en pantalla. El humor se ve, no se
  anuncia. Los avisos push son fase 3 y se deciden aparte.

## 7. Página `/mascota`

- Cabecera: sprite a 2× animado, nombre, clase, etapa, nivel y barra de XP hasta el siguiente.
- Seis atributos como barras con el primario marcado. Reutiliza el armazón de paneles de
  estadísticas; ninguna viz nueva.
- **«Qué la sube»**: por atributo, una línea con sus fuentes y lo aportado en los últimos siete días.
  Sin esto la mascota parece arbitraria; con esto es la explicación honesta de la fórmula.
- Acciones: renombrar, cambiar de clase (confirmación), ocultar compañera.
- Sin `pet_state`: la ruta es la eclosión (bellota, nombre, clase con sugerencia). Un paso.
- Entrada en la navegación: fila en el menú «Tú» (segundo nivel del avatar), no en la barra de
  cinco. La barra ya está decidida y la mascota no es un destino diario: la compañera lo es.

## 8. Datos

**Tabla `pet_state`** (migración `supabase/migrations/20260902_pet_state.sql`, **dev primero**):

| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid PK, FK `auth.users` `on delete cascade` | una mascota por usuario |
| `name` | text not null | 1-24 caracteres, validado en servidor |
| `class` | text not null | valores en `classes.ts` |
| `hatched_at` | timestamptz not null default now() | |
| `companion_hidden` | boolean not null default false | |
| `last_level` | int not null default 1 | último nivel calculado; detecta subidas |
| `last_stage` | text not null default 'acorn' | último estado calculado; detecta evolución |
| `created_at`, `updated_at` | timestamptz | |

RLS: `select`/`insert`/`update` solo propias (`auth.uid() = user_id`), sin `delete` (la mascota no se
borra; se va con la cuenta). Sin acceso `anon`. **Grant por columna** a `authenticated` y superficie
6 de `docs/DRIFT-CHECK.md` antes de cerrar: una columna sin grant rompe la escritura entera (#375).
Actualizar `docs/requirements/data-model.md` (nueva sección «8bis. Mascota» tras Play, sin renumerar el resto) y `schema-baseline.sql`.

**Nada de XP ni atributos en tabla.** `src/lib/pet/`:

- `balance.ts`, `classes.ts`, `manifest.ts`: constantes.
- `derive.ts`: `deriveAttributes`, `xpFor`, `levelFor`, `stageFor`, `moodFor`, `suggestClass`. Puras.
- `get-pet-counts.ts`: reúne los contadores de las fuentes existentes con el cliente de la
  petición. Reutiliza `getStreaks` y las funciones de `src/lib/stats/` en vez de duplicar consultas.
- `get-pet-snapshot.ts`: **completa** (contadores + derivación + estado) para `/mascota`.
- `get-companion-state.ts`: **ligera** (clase, etapa, humor, nombre) para el shell: `pet_state` +
  última actividad. Es la que corre en cada página; tiene que ser una o dos consultas, no diez.
- `actions.ts`: `hatchPet`, `renamePet`, `changeClass`, `setCompanionHidden`. Server actions con
  validación.

**Subidas y evoluciones.** Al calcular el snapshot completo, si `level > last_level` o `stage !=
last_stage`, se actualizan ambos y se gana la celebración `pet_level_up:<nivel>` / `pet_evolved:
<etapa>` (scope `milestone`, dedupe por clave como las demás). Solo se detecta cuando alguien mira
`/mascota` o cuando la compañera lo pide: no hay cron. Es aceptable en fase 1 y se dice en la doc.

**Caché.** Todo depende de la sesión (RLS por `auth.uid()`): **nada de `use cache`** (regla #437).
Compañera y página detrás de `<Suspense>`; el shell estático no la contiene.

## 9. Testing

- Unitarios (Vitest): `deriveAttributes` con fixtures de contadores (incluido el máximo minutos vs
  páginas y el tope de importación); `levelFor` en los umbrales 10 y 40; `stageFor` con bellota sin
  actividad; `moodFor` alrededor de medianoche Madrid; `suggestClass` con empate; test del manifiesto
  contra `public/pet/`.
- Componente: `<PetSprite>` compone las capas correctas por clase × etapa × humor y respeta
  `prefers-reduced-motion`.
- E2E (Playwright, contra `next build` + `next start`): eclosión con nombre y clase; compañera
  visible en `/coleccion` y ausente en `/partida/activa` y en rutas públicas; tap navega a
  `/mascota`; registrar una sesión dispara la reacción; ocultar desde ajustes la quita en otra
  pestaña.

## 10. Fuera de fase 1

Cada línea es una issue `tipo:feature` abierta al cerrar esta spec:

- Misiones diarias generadas + logros permanentes (extiende el registro de celebraciones).
- Avisos push por humor y racha (reusa `push-toggle` y el cron de recordatorios de club).
- Jefes PvE sobre `challenges`; motor de combate stats vs stats con azar.
- PvP asíncrono entre seguidos, sobre el mismo motor.
- Cosméticos desbloqueables (capas nuevas en el manifiesto) y economía de bellotas.
- BiblioPlay como fuente (DES / Pícaro / objetos).
- RPC SQL `get_pet_snapshot()` para el widget nativo, port fiel de `derive.ts` como se hizo con
  `get_widget_snapshot`.
- Detección de subida de nivel sin abrir `/mascota` (cron o gancho en `addSession`).
