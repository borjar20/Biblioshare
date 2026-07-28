# Sesiones: hora de inicio opcional en el registro manual — diseño

> **[Spec de diseño · propuesta, no construido]** Redactado el 2026-07-28.
>
> **Este ciclo no toca esquema ni servidor**: ninguna migración, ningún cambio en
> [`data-model.md`](../../requirements/data-model.md), ninguna línea nueva en
> `src/lib/sessions/actions.ts`. Cierra la issue
> [#252](https://github.com/borjar20/Biblioshare/issues/252).

## 0. Problema

`progress_sessions.started_at` (`timestamptz`, nullable) guarda la hora real de inicio de una
sesión — la columna correcta para una futura estadística de "a qué hora sueles leer" (ver
[`2026-07-28-sesiones-hora-registro-design.md`](2026-07-28-sesiones-hora-registro-design.md),
que la dejó fuera de alcance a propósito por ser un problema distinto). Hoy solo la rellena el
flujo del cronómetro; la hoja de registro manual —el único camino que existe en la práctica—
la deja `null` siempre.

**Medido en prod el 2026-07-28** (`vmutcradmodhiltuohys`, antes de este cambio): de 18 filas en
`progress_sessions`, **0 tienen `started_at`**. 0 % de cobertura — nadie ha usado el cronómetro
todavía en producción real.

## 1. Lo que ya existe y no hay que tocar

El servidor **ya sabe** recibir y guardar `startedAt` — no es una feature nueva, es un segundo
remitente para una tubería que ya funciona:

- `src/lib/sessions/actions.ts:96-104` (`addSession`) ya lee `formData.get("startedAt")`, la
  parsea con `new Date(...)` y la guarda como `started_at` si es una fecha válida, `null` si no
  llega. Cero cambios aquí.
- El remitente actual es `src/components/session/session-timer.tsx:134-140`: un
  `<input type="hidden" name="startedAt">` que solo se pinta cuando el cronómetro se ha
  arrancado alguna vez (`state.firstStartedAt != null`), con el valor calculado en el
  **cliente** (`new Date(state.firstStartedAt).toISOString()`) — nunca en el servidor, así se
  evita cualquier desajuste de zona horaria entre el huso del usuario y el del servidor.

Este ciclo añade un **segundo** remitente de `startedAt`, para el modo manual, con el mismo
patrón: calculado en cliente, mandado con el mismo nombre de campo.

## 2. Decisión

| # | Decisión | Por qué |
|---|---|---|
| D1 | Nuevo `<input type="time">` opcional en el modo "A mano" de `BookProgressField` (junto a Duración), **sin valor por defecto** — nunca se rellena con "ahora". | Es exactamente lo que la issue #252 prohibió: rellenar con la hora de envío sería la misma falsa precisión del bug de tiempo relativo que motivó la spec hermana. Vacío = comportamiento actual, sin regresión. |
| D2 | La hora se combina con el valor del campo Fecha **en el cliente**, produciendo un ISO completo, mandado como `startedAt` — mismo nombre de campo, mismo formato que ya produce el cronómetro. | Reutiliza la tubería del servidor sin tocarla. Combinar en cliente (no en servidor) evita que un servidor en otro huso horario interprete mal una fecha+hora sin offset — el mismo motivo por el que el cronómetro ya lo hace así. |
| D3 | El campo Fecha de `session-sheet.tsx` pasa de no controlado (`defaultValue`) a controlado, y su valor baja como prop a `BookProgressField`. | Es la única forma de combinar fecha+hora en cliente sin que ambos campos vivan en el mismo componente — Fecha es del padre, Duración/hora del hijo. Cambio mecánico, no de comportamiento visible. |
| D4 | El nuevo input solo se pinta en modo `"manual"` de Duración — nunca junto al cronómetro. | Mutuamente excluyente por diseño, igual que ya pasa con `durationMinutes` (un único `name` activo a la vez): si se pintaran los dos a la vez habría dos `name="startedAt"` en el DOM y `FormData` se quedaría con el primero en orden de documento, un bug silencioso. |
| D5 | Solo libro. Serie no gana una sección de hora — sigue sin duración ni cronómetro (D9, `2026-07-20-registrar-sesion-v2-design.md`). | D9 ya es una decisión tomada y vigente; añadir hora a serie reabriría esa decisión sin que la issue #252 lo pidiera. Si algún día se quiere "a qué hora ves series", es su propio ciclo. |
| D6 | Sin hint largo explicando el porqué del campo — una etiqueta corta basta ("¿A qué hora empezaste? (opcional)"), mismo registro que el resto del formulario. | YAGNI: el campo ya se explica solo por estar junto a Duración y decir "opcional"; el resto de campos opcionales del formulario (nota, duración) tampoco llevan justificación. |

## 3. Fuera de alcance

La estadística "a qué hora sueles leer" en sí (agregación, gráfico, dónde se muestra) — este
ciclo solo aumenta la cobertura de datos que la alimentarán. Sigue sin diseñarse, y con 0 %→N%
de cobertura parcial, esa futura estadística deberá comunicar explícitamente "basado en N de M
sesiones", como ya apuntaba la issue.

## 4. Cambios

- `src/components/session/book-progress-field.tsx` — nuevo estado `startedAtTime` (string,
  vacío por defecto); nuevo prop `sessionDate: string` (recibido del padre); en el bloque
  `durationMode === "manual"`, un `<input type="time">` visible + un
  `<input type="hidden" name="startedAt">` que solo se pinta cuando `startedAtTime` no está
  vacío, con valor `new Date(\`${sessionDate}T${startedAtTime}\`).toISOString()`.
- `src/components/session/session-sheet.tsx` — el `<input type="date" name="sessionDate">`
  pasa a controlado (`value` + `onChange` en vez de `defaultValue`); su valor se pasa a
  `<BookProgressField sessionDate={...} />`.
- Traducciones nuevas en el namespace `session` de `messages/es.json` (único locale del
  proyecto hoy): etiqueta del campo hora. Sin tocar ninguna clave existente.
