# Rediseño de widgets Android «En curso» + «Registro» (Paper) — spec

**Fecha:** 2026-08-06 · **Issue:** #498 (rediseño), sobre la Fase 2 de #497 (los widgets ya
leen de Supabase vía RPC `get_widget_snapshot`). · **Estado:** aprobado el diseño, pendiente de
plan de implementación.

## 1. Problema

Los widgets se ven rotos en dispositivo: **fondo transparente** y **botones que parecen rotos**.
Diagnóstico (en código, sin dispositivo): los estados de CONTENIDO (`Completo` en
`CurrentProgressWidget`, `PickStep`/`RegisterStep` en `QuickRegisterWidget`) pintan su `Column`
raíz **sin `.background()`**; solo los estados vacíos y `DailyGoalWidget` usan `WidgetCard`, que sí
pone fondo. Resultado: el contenido flota sobre el widget transparente, con el wallpaper del
launcher detrás, y los botones de color sutil (`track` beige) se ven rotos.

Además, el estilo «no coincide» con Paper: el token oscuro `widget_bg` actual (`#2A231D`) es en
realidad la *surface* de Paper, así que no hay separación de profundidad fondo↔tarjeta. Y el
Registro rápido no hace lo que se quiere (chips de minutos en vez de cronómetro).

Referencia visual: mockup del dueño `Paper - Widget de registro (2 tamaños).html` (Claude Design,
proyecto `7502da71-…`). Es la fuente de verdad de la forma; se **adapta** a Glance (ver §3).

## 2. Alcance

- **Rediseñar** `CurrentProgressWidget` («Completo») y `QuickRegisterWidget` («Reducido»).
- **Añadir pausa nativa** al cronómetro del widget (reabre a propósito el techo de #489).
- **NO se toca** `DailyGoalWidget` en este pase (queda para otro, idealmente con su mockup).
- **NO se toca** la capa de datos (Fase 2 ya cerrada) ni la cadena TS del dashboard.

## 3. Restricciones de Glance (lo que NO es 1:1 con el mockup)

Decididas con el dueño; se compensan, no se pelean:

- **Sin fuentes propias.** Glance `TextStyle` (1.1.1) no tiene `fontFamily`: los títulos NO pueden
  ser Fraunces serif; se usa la fuente del sistema con jerarquía por tamaño/peso.
- **Sin anillo cónico.** No hay `conic-gradient`. El cronómetro se representa con **texto grande
  MM:SS vivo** (`Chronometer` nativo vía `AndroidRemoteViews`, que ya tickea con la app cerrada),
  no un círculo.
- **`cornerRadius` solo recorta en Android 12+** (API 31). En versiones previas no redondea pero el
  fondo sí pinta; degradación aceptable.
- Sin `color-mix`, sombras ni bordes con alpha arbitrario: la pastilla de racha y el borde del pie
  usan colores sólidos o con alpha fijo definidos como recursos.

## 4. Tokens de color (Paper, ambos temas)

Fuente: `globals.css` de Paper (design system). Se **remapea** la paleta del widget para dar
profundidad (fondo más hondo que las tarjetas) y se añaden tokens que faltan.

| Recurso (`widget_*`) | Rol | Claro | Oscuro |
|---|---|---|---|
| `widget_bg` | fondo raíz del widget (antes era surface) | `#F3ECE1` | `#1F1A16` |
| `widget_surface` | tarjetas (destacada, filas) | `#FFFDF8` | `#2A231D` |
| `widget_track` | pista de barra, chip, punto-off, botón secundario | `#ECE3D4` | `#332B23` |
| `widget_fg` | texto principal | `#2C2620` | `#F0E8DB` |
| `widget_fg_soft` | texto secundario/mono (= muted-foreground) | `#877E70` | `#A99E8C` |
| `widget_accent` | acento (barra, activo, CTA) | `#B0542F` | `#D98A5C` |
| `widget_accent_fg` | texto SOBRE acento (nuevo) | `#FFF5EF` | `#1F1409` |
| `widget_gold` | rombo de racha | `#C98A2B` | `#E0A94A` |
| `widget_border` | divisor del pie (con alpha) | `#242C1420` | `#1FF0E8DB` |

`widget_surface` (claro) actual pasa de `#FBF5EA` a `#FFFDF8` (el `surface` canónico); `widget_bg`
se hace más hondo. Los nombres se conservan para no romper referencias existentes; se AÑADEN
`widget_accent_fg` y `widget_border`. Ambos ficheros: `values/widget_colors.xml` y
`values-night/widget_colors.xml`. El drawable `widget_background.xml` ya usa `@color/widget_bg`,
así que hereda el fondo hondo automáticamente.

## 5. Superficie opaca (arreglo del fondo) — común

Nuevo composable `WidgetSurface(content)` en `WidgetUi.kt`: un `Box` con
`.fillMaxSize().background(ImageProvider(R.drawable.widget_background)).padding(12.dp)` **sin**
`clickable` (a diferencia de `WidgetCard`, que navega toda la superficie). Todos los estados de
CONTENIDO se envuelven en `WidgetSurface`:

- `CurrentProgressContent` → `Completo` dentro de `WidgetSurface`.
- `QuickRegisterContent` → `PickStep`/`RegisterStep`/vista de crono dentro de `WidgetSurface`.

Los estados vacíos siguen con `WidgetCard` (fondo + navegación a `/`, `/coleccion`, etc.), que se
refactoriza para reusar `WidgetSurface` por dentro.

## 6. Widget «Completo» (`CurrentProgressWidget`)

Estructura (de arriba a abajo), sobre `WidgetSurface`:

1. **Cabecera** `SectionHeader`: «EN CURSO» (mono, mayúsculas, `fg_soft`) + a la derecha
   «N · ver todos ›» (`accent`, clicable → `/coleccion?status=in_progress`). Sin cambios de
   comportamiento; ajuste de estilo.
2. **Aviso `stale`** (48 h) si aplica (se conserva, #492).
3. **Tarjeta destacada** `FeaturedCard` (`surface`, `cornerRadius(18dp)`), con:
   - **Barra de acento a la izquierda**: `Row` con un `Box` de `width(4dp).fillMaxHeight()` en
     `accent` seguido del contenido (Glance no tiene `::before`; se emula con la columna de 4dp).
   - Portada 72×104 (`cornerRadius(8dp)`), y a la derecha: **ordinal** (`nthLabel`, accent mono),
     **título** (`fg`, grande/negrita), **contexto** (`contextLabel`, `fg_soft`).
   - **«Meta de hoy»** (del `dailyGoal` GLOBAL del snapshot, no del pase): fila
     «Meta de hoy» + «X / Y min» y una `SoftBar` con el porcentaje. Si `dailyGoal` es null, se
     omite el bloque. *(Decisión confirmada: el destacado muestra la meta global, como el mockup,
     en vez del % de páginas del pase.)*
   - **Fila racha + semana**: `StreakPill` (rombo `gold` + «Racha N d», fondo `track`, borde/tinte
     accent) a la izquierda y `WeekDots` (7 cuadraditos `cornerRadius(4dp)`: activo=`accent`,
     hoy=borde `fg_soft` sin relleno, off=`track`) a la derecha. Solo si `streakDays>0` o hay semana.
   - **Pie partido** con borde superior (`widget_border`): dos celdas al 50%,
     **◷ Sesión** (`accent`, divisor a la derecha) │ **✎ Registrar** (`fg`).
     - *Sesión* (solo libros) → inicia/abre la **vista de cronómetro** (§8).
     - *Registrar* → `actionStartActivity` a la hoja de sesión web (`itemLogHref`, ya existe).
4. **«Continúa donde lo dejaste»** (`ContinueGrid`, 3 columnas): portada + título; tocar sube ese
   pase a destacado (`SelectFocusAction`, ya existe).

## 7. Widget «Reducido» (`QuickRegisterWidget`)

Dos pasos, sobre `WidgetSurface`. **Sin chips de minutos** (decisión invertida respecto al mockup).

- **Paso 1 — elegir** (`PickStep`): cabecera «Registrar lectura» + «N en curso»; una `CompactRow`
  por pase en curso (portada 36×54, `kindLabel`, título, barra o «Sin progreso»). Tocar una fila →
  paso 2 con ese pase.
- **Paso 2 — sesión** (invertido): **directo a la vista de cronómetro** (§8) del pase elegido, con
  back ‹ que vuelve al paso 1. Acceso secundario **«Registrar en la app»** (enlace `fg_soft`) →
  `actionStartActivity` a la hoja de sesión web (`/sesion/{passId}`), para registro manual sin
  cronómetro. Para no-libros (sin cronómetro) el paso 2 es solo ese acceso a la hoja/ficha.

El estado Glance del Reducido (`STEP_KEY`, `QR_SELECTED_KEY`) se conserva; desaparecen
`QR_MINUTES_KEY` y las acciones de chips (`PickMinutesAction`) — el paso de minutos se sustituye
por el cronómetro. `PickAction` deja el paso en 2 con el pase elegido (sin fijar minutos).

## 8. Vista de cronómetro con PAUSA nativa (Fase B)

Reemplaza el pie de acciones (Completo) y es el paso 2 (Reducido) cuando hay cronómetro para ese
pase. Reabre a propósito el techo de #489 (antes: pausar en la app apagaba el widget).

**Render:**
- **Corriendo**: `Chronometer` vivo (MM:SS) + botones **Pausar** │ **Registrar**. (Y «Descartar».)
- **Pausado**: tiempo CONGELADO como `Text` (Glance no puede parar un `Chronometer` mostrando el
  elapsed) + **Reanudar** │ **Registrar**, y «Descartar».
- **Sesión larga** (>4 h): se conserva el aviso que invita a abrir la app (`isLongSession`).

**Modelo nativo** (`TimerStore`/`TimerLogic`, en ms de reloj de pared, alineado con `timer.ts` de
la web para que los dos relojes se conviertan sin fricción):

| Campo | Significado |
|---|---|
| `timer_pass_id` | pase del cronómetro |
| `timer_anchor` | ancla efectiva (`startedAt - accumulated`); `now - anchor == elapsed` mientras corre |
| `timer_accumulated` | ms acumulados de tramos previos (para el elapsed congelado y para reanudar) |
| `timer_running` | corriendo / pausado |
| `timer_first_at` | hora real del primer arranque (para `inicio` de «Cuándo lees») |

- `elapsed(now) = running ? now - anchor : accumulated`.
- Arrancar: `accumulated=0`, `anchor=now`, `running=true`, `first=now`.
- Pausar: `accumulated = now - anchor`, `running=false`.
- Reanudar: `anchor = now - accumulated`, `running=true`.
- Registrar: `minutos = round(elapsed/60000)`, `inicio = first` → `/sesion/{pass}?minutos=&inicio=`,
  y lápida (`clearFromWidget`, #493).
- Chronometer (corriendo): base = `chronometerBase(anchor, now, elapsedRealtime)` (ya existe).

**Acciones nuevas** (`WidgetActions.kt`): `PauseTimerAction`, `ResumeTimerAction`. Se conservan
`StartTimerAction`, `DiscardTimerAction`, `RegisterTimerAction` (esta recalcula minutos con el
`elapsed` pausable).

**Reconciliación de los dos relojes** (native ↔ web), la parte con trampas:
- Puente `getRunningTimer`/`setRunningTimer` (plugin + `android-widgets.ts`): ganan
  `accumulated` y `running` (además de `anchor`/`firstStartedAt`).
- `mirrorToWidget` (app→native, `timer.ts`): al **pausar** ya NO llama a `clearRunningTimer`; llama
  a `setRunningTimer` con `running=false` + `accumulated`, para que el widget muestre «pausado».
  Al correr, igual que hoy (`anchor` efectivo). Al cerrar/reset: `clearRunningTimer`.
- `seedTimerFromWidget` (native→app, `widget-timer-bootstrap.ts`): lee `{anchor, accumulated,
  running, first}` y construye el `TimerState` web (running: `startedAt = anchor + accumulated`,
  `accumulatedMs = accumulated`; pausado: `startedAt = null`, `accumulatedMs = accumulated`). La
  lápida (#493) se conserva.

Conversión (para que el elapsed coincida en ambos lados):
`web.startedAt = anchor + accumulated`, `web.accumulatedMs = accumulated`, `widgetAnchor(web) ==
anchor`. Verificable en `timer.test.ts` / `TimerStoreTest`.

## 9. Fases (cada una desplegable y verificable en dispositivo)

- **Fase A — visual + flujo (sin pausa).** Tokens Paper (§4), `WidgetSurface` (§5, arregla el
  fondo), restyle Completo (§6), restyle Reducido con flujo pick→crono (§7) usando el cronómetro
  **actual sin pausa** (Descartar/Registrar). Bajo riesgo; entrega el arreglo visible.
- **Fase B — pausa nativa (§8).** Modelo `TimerStore` con `accumulated`/`running`, acciones
  Pause/Resume, render pausado, y la reconciliación de los dos relojes. Aislada para su propia
  ronda de pruebas en dispositivo.

## 10. Verificación

- **Automática:** `compileDebugKotlin`; `testDebugUnitTest` (nuevos casos de `TimerLogic`:
  pausar/reanudar/elapsed, conversión); `vitest` (`timer.ts` ya cubre pausa; añadir la conversión
  native↔web); `tsc` + `eslint`.
- **Dispositivo (obligatoria, #485/#498):** fondo opaco en claro y oscuro; Completo (destacado,
  meta, racha/semana, pie, rejilla); Reducido (pick → crono → registrar→web); pausar/reanudar con
  la app CERRADA y que el tiempo cuadre; registrar abre la web con los minutos correctos; sync de
  dos vías app↔widget con pausa (abrir la app a mitad de pausa refleja el estado).

## 11. Riesgos

- **Dos relojes con pausa** (#489-#493): es la zona que ya dio varios bugs. Mitigación: modelo en
  ms de pared idéntico en ambos lados, conversión con test, y Fase B aislada.
- **Reproducción del mockup**: la fuente del sistema y la ausencia de anillo alejan el resultado
  del mockup; se asume (decidido con el dueño). El «parecido» se valida en dispositivo, no contra
  el HTML.
