# Sesión de lectura nativa: notificación persistente + widget 1-fila — spec

**Fecha:** 2026-08-08 · **Epic:** #497 (arquitectura híbrida) · rediseño widgets #498 (ya en
`main`). · **Estado:** diseño aprobado, pendiente de plan de implementación.

## 1. Problema y punto de partida

El enunciado pide una «sesión de lectura nativa» sincronizada entre WebView, widget y
notificación persistente, con un widget compacto de 1 fila. **La mayor parte ya existe** tras
#498 (mergeado en `main`). Lo que hay hoy:

- **`ReadingSession` nativa por timestamps** en `TimerLogic`/`TimerStore` (SharedPreferences
  `biblioshare_widgets`): `start`/`pause`/`resume`/`clear` + lápida (`cleared_*`), con
  `startedAt` (ancla efectiva, ya descuenta pausas), `firstStartedAt` (hora real de inicio),
  `accumulatedMs` y `running`. Sigue contando con la app cerrada porque el elapsed se **deriva**
  (`now - startedAt`), no hay contador vivo. Sin `MediaSession`, sin `setInterval` del WebView.
- **Una sola sesión lógica compartida app↔nativo**: espejo `localStorage` (`src/lib/sessions/timer.ts`,
  `widgetMirror`/`timerStateFromWidget`) ↔ `TimerStore`, reconciliado al volver a primer plano
  (`widget-timer-bootstrap.ts`). Plugin Capacitor local `BiblioshareWidget`
  (`getRunningTimer`/`setRunningTimer`/`clearRunningTimer`/`syncNow`).
- **Widget grande** `CurrentProgressWidget` (4x3/4x2) con selector de varios `in_progress` +
  selección recordada (`SELECTED_PASS_KEY`), pausa in-widget y controles Pausar/Reanudar/
  Descartar/Registrar (`SessionTimerView`, `WidgetUi.kt`).
- **Terminar → Supabase**: `RegisterTimerAction` abre `/sesion/:passId?minutos=&inicio=` y
  `addSession` (server action) hace TODO: transición del pase, avance de posición, episodios de
  serie + `rollSeriesProgress`, enlaza notas, notifica seguidores, celebraciones del bucle diario,
  auto-cierre al llegar al final.

**Lo que falta de verdad (el delta de esta spec):**

1. **Notificación persistente** de la sesión: no existe **ni una línea** de notificación en
   `android/`. Es la pieza grande nueva.
2. **Widget compacto de 1 fila (4x1)**: los widgets actuales son 4x3/4x2. Falta un widget nuevo
   con un `⏭` que rote circularmente por los `in_progress` (hoy la selección se hace tocando una
   portada del carrusel, no con un botón «siguiente») y que se **fije al pase en curso** durante
   la sesión.

## 2. Alcance

**Dentro:**
- Foreground service + notificación *ongoing* que espeja la `ReadingSession`.
- Widget `ReadingRowWidget` (4x1) con modos selector / sesión.
- Acción nueva `CycleFocusAction` (`⏭`) y funciones puras de estado + su cobertura JVM.

**Fuera (no se toca):**
- `TimerLogic`/`TimerStore` (fuente de verdad, ya correcta) salvo lo mínimo para exponer lo que
  la notificación necesite leer (que ya es todo público).
- La capa de datos web, `timer.ts`, el plugin Capacitor (su API basta) y **el esquema Supabase**:
  **cero migraciones, cero RPC nueva**. `■ Terminar` reusa el handoff `addSession`.
- Los otros tres widgets (`CurrentProgressWidget`, `DailyGoalWidget`, `QuickRegisterWidget`).

## 3. Fuente de verdad y sincronización

`TimerStore` sigue siendo la **única** `ReadingSession` (una global). Widget grande, widget
1-fila y notificación son **tres consumidores del mismo store**; ninguno guarda estado de sesión
propio. El espejo app↔nativo queda intacto.

**Hook único** `ReadingSessionController.sync(context)`:
- Lee `TimerStore.get()`.
- Si hay sesión → arranca el service (si no corría) y (re)construye la notificación.
- Si no hay → para el service (`stopSelf` + `stopForeground`).

Se invoca desde **los mismos puntos que hoy repintan el widget**, para que el diff sea mínimo y
la causa raíz única:
- En las acciones nativas de widget: junto a `refreshWidgets(...)` de `WidgetActions.kt`
  (`Start`/`Pause`/`Resume`/`Discard`/`RegisterTimerAction`).
- En el plugin: dentro de `setRunningTimer` y `clearRunningTimer` de `BiblioshareWidgetPlugin`
  (justo donde ya llaman a `WidgetRefresh.updateAll`).

> Nota de acoplamiento: `sync` se llama **al lado** del refresco de widgets, no dentro de
> `WidgetRefresh`, para no atar el repintado Glance al ciclo de vida del service.

**Arranque del service desde el widget con la app cerrada:** en Android 12+ está prohibido
arrancar un FGS desde segundo plano, **salvo exenciones**; «el usuario interactúa con un elemento
de un widget» es una de ellas, así que el `▶` del widget puede arrancar el service. Los puntos de
*arranque* del FGS son solo dos —`StartTimerAction` (widget, exención) y el espejo
`setRunningTimer` mientras la app está en primer plano—; Pausar/Reanudar/Terminar actúan sobre un
service **ya vivo**, no lo arrancan.

## 4. Foreground service + notificación

**`ReadingSessionService`** (nuevo, paquete `app.biblioshare.mobile.reading`):
- Tipo `specialUse` (permiso `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE`). Es el tipo
  honesto para un cronómetro visible sin categoría propia; **la distribución es Firebase App
  Distribution (sideload), no Google Play**, así que el escrutinio de Play sobre `specialUse` no
  aplica. Se declara el `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" …>`.
- Canal dedicado `reading_session` (importancia `LOW`: sin sonido ni vibración; es una barra de
  estado, no una alerta). Separado del canal de push.
- El service **no** guarda estado: en cada `sync` lee `TimerStore` + el snapshot
  (`WidgetSnapshotStore.load`) para sacar título y portada del pase en curso, y llama a
  `startForeground(ID, buildNotification(...))`.

**Notificación** (*ongoing*, no descartable):
- `largeIcon` = portada del pase (bitmap de `WidgetImageCache`, ya cacheado); `smallIcon` = nuevo
  vector monocromo `ic_stat_reading` (no hay ninguno; el fallback sería un cuadro blanco). Título
  = título del pase; texto = contexto («Leyendo» / label del pase).
- **Corriendo**: `setUsesChronometer(true)` + `setWhen(startedAt)` (ancla efectiva en
  `System.currentTimeMillis()`, la misma que ya persiste `TimerStore`) → el sistema tickea el
  tiempo **sin proceso vivo y sin `setInterval`**, igual que el `Chronometer` del widget.
- **Pausado**: chronometer off; tiempo congelado `fmtElapsed(elapsedMs(running, now))` en el texto
  (reusa `WidgetTimer.kt`).
- **Acciones**: `⏸ Pausar` / `▶ Reanudar` (toggle según `running`), `■ Terminar`, y `Descartar`
  como acción secundaria (paridad con el widget: sin ella, la única forma de tirar una sesión
  sería abrir la app). Cada acción = `PendingIntent` de broadcast a **`ReadingSessionReceiver`**:
  - Pausar/Reanudar → `TimerStore.pause/resume` → `sync` (notif) + `WidgetRefresh.updateAll`.
  - Descartar → `TimerStore.clearFromWidget` (deja lápida, #493) → `sync` (para el service) + refresh.
  - Terminar → misma lógica que `RegisterTimerAction`: calcula `minutos`/`inicio`, `clearFromWidget`,
    lanza el deep-link `/sesion/:passId?minutos=&inicio=` (abre la app), y el `sync` posterior para
    el service.
- **Ciclo de vida**: el service vive **toda** la sesión (corriendo **o** pausado); solo para en
  Terminar/Descartar/clear. `ponytail:` una sesión pausada mantiene un FGS vivo — coste ~0 (no hace
  trabajo, solo sostiene la notificación); alternativa (degradar a notif normal al pausar y
  re-promover al reanudar) rechazada por la fricción de re-arrancar el FGS desde segundo plano.

## 5. Widget compacto 1-fila (`ReadingRowWidget`, 4x1)

Nuevo receiver `ReadingRowWidgetReceiver` + provider `reading_row_widget_info.xml`
(`minWidth≈250dp`, `minHeight≈40dp`, `targetCellWidth=4`, `targetCellHeight=1`, resize horizontal)
+ composable, **reutilizando** `currentProgressState`, `TimerLogic`, `Cover`, `SoftBar` y el
`Chronometer` (`widget_chronometer.xml` / `widget_static_time.xml`). Añadir el receiver al manifest
y a `WidgetRefresh.updateAll`.

**Destacado (`featured`) del row:**
- **Con sesión activa** → **fijado al pase en curso** (pin), `⏭` oculto:
  `[portada · título · cronómetro/congelado · ⏸/▶ · ■]`.
- **Sin sesión** → `featured = seleccionado-o-[0]`:
  `[portada · título · barra de progreso · ▶ (solo libro) · ⏭ (si hay >1 in_progress)]`.

**Reglas:**
- `⏭` = `CycleFocusAction`: rota **circular** al siguiente de `snapshot.inProgress` tras el
  `featured` (wrap-around) y persiste en clave propia `row_selected_pass_id` (independiente del
  `SELECTED_PASS_KEY` del widget grande, para que no se pisen). «Recuerda el seleccionado» ✓.
- `▶`/`⏸`/`▶`/`■` reusan `StartTimerAction` / `Pause` / `Resume` / `RegisterTimerAction`. El `▶`
  arranca el timer nativo **sin abrir la app**; la notificación aparece sola por el hook del §3.
- **Pin cuando el pase en curso no está en el snapshot** (raro; snapshot caducado): se cae a modo
  selector. En el flujo normal el pase en curso ∈ `inProgress` porque el `▶` se pinta desde esa
  lista.
- **Series**: sin `▶` (no tienen sesión de tiempo, igual que `SessionTimerView`); la fila muestra
  progreso y abre al tocar.

## 6. Sin cambios web ni SQL

`■ Terminar` (widget y notificación) reusa el handoff existente
`/sesion/:passId?minutos=&inicio=` → `addSession`, que ya hace progreso, racha, celebraciones,
notas y auto-cierre. **No** se duplica esa lógica en una RPC nativa (sería medio backend
replicado, con riesgo de drift). Ni migración, ni RPC, ni tocar `timer.ts` ni el plugin.

## 7. Ficheros

**Nuevos (nativo):**
- `android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionService.kt` — FGS + ensamblado de la notificación.
- `.../reading/ReadingSessionReceiver.kt` — acciones de la notificación (broadcast).
- `.../reading/ReadingNotification.kt` — **función pura** `readingNotificationModel(running, snapshot, now)` (¿mostrar?, corriendo/pausado, título/subtítulo/tiempo) + `ReadingSessionController.sync`.
- `.../widgets/ReadingRowWidget.kt` — widget 1-fila (receiver + composable).
- `res/xml/reading_row_widget_info.xml`, `res/drawable/ic_stat_reading.xml`, previews opcionales.
- Tests JVM: `ReadingNotificationTest.kt`, `ReadingRowStateTest.kt`.

**Tocados (nativo):**
- `WidgetActions.kt` — nueva `CycleFocusAction` + `ReadingSessionController.sync(...)` junto a los refresh.
- `BiblioshareWidgetPlugin.kt` — `sync(...)` dentro de `setRunningTimer`/`clearRunningTimer`; añadir `ReadingRowWidget` a `WidgetRefresh.updateAll`.
- `WidgetState.kt` / `WidgetTimer.kt` — funciones puras `nextInProgress(...)` y `readingRowState(...)` (o junto al widget).
- `AndroidManifest.xml` — permisos FGS, `<service>` + `<receiver>` del row.
- `messages`/strings del widget (`res/values/strings` del módulo) para las etiquetas nuevas.

**Web/TS:** ninguno.

## 8. Pruebas (JVM puro, estilo del módulo — sin Robolectric)

- `nextInProgress(items, currentId)`: wrap-around, lista de 1, `currentId` ausente, lista vacía.
- `readingRowState(snapshot, selected, running)`: SignedOut / NothingInProgress / selector con y
  sin `▶` (libro vs serie) / sesión activa con **pin** al pase en curso aunque `selected` sea otro /
  pase en curso ausente del snapshot → cae a selector.
- `readingNotificationModel(running, snapshot, now)`: sin sesión → `null`; corriendo → chronometer
  con `when=startedAt`; pausado → tiempo congelado; sesión larga (>4h) → aviso.
- Regla del proyecto (memoria «tests que no protegen»): provocar el fallo y ver el test rojo antes
  de darlo por bueno (p. ej. romper el wrap-around y confirmar que `nextInProgress` falla).

## 9. Verificación en dispositivo y trampas de build

El motor es nativo: la verificación real es en dispositivo con APK debug. Antes de compilar en
worktree (memoria «Widgets Android»): `npx cap sync android`, `local.properties` + `JAVA_HOME` al
JBR, y **revertir los gradle regenerados** antes de commitear. Comprobar en dispositivo:
1. Sin sesión, 1 `in_progress` → row con `▶`, sin `⏭`.
2. Sin sesión, ≥2 `in_progress` → aparece `⏭`; rota circular y recuerda la selección.
3. `▶` con la app cerrada → arranca timer + **aparece la notificación** (exención de widget).
4. Notificación: cronómetro tickea en background; `⏸` congela; `▶` reanuda; el row se **fija** al
   pase en curso y oculta `⏭`.
5. `■ Terminar` → abre `/sesion/:passId` prerrellenado; al guardar, row y notificación vuelven a
   modo selector y `⏭` reaparece si siguen ≥2 `in_progress`.
6. OEM agresivo (One UI): la notificación sobrevive al background (razón de elegir FGS sobre notif
   *ongoing* pelada).

## 10. Techos y decisiones

- `ponytail:` sesión pausada mantiene el FGS vivo (coste ~0).
- `ponytail:` `specialUse` como tipo de FGS; subtipo declarado en manifest. Si algún día se publica
  en Play, revisar la justificación del subtipo.
- **Decidido con el dueño (2026-08-08):** `■` reusa el handoff `addSession` (no escritura nativa
  silenciosa); notificación por **foreground service** (no notif *ongoing* pelada).

## 11. Definición de «hecho»

- Ningún cambio de esquema → `data-model.md` intacto.
- Al cerrar: abrir issue de seguimiento bajo el epic #497 con las etiquetas
  `area:infra,tipo:feature,P2` (las issues son el backlog operativo) y marcar lo que corresponda en
  `backlog.md` si estaba listado. Entrada en `decisiones.md` con las dos decisiones del §10.
