# Notas desde el cronómetro de portada — Design Spec

**Fecha:** 2026-07-29

## Problema

El cronómetro rápido de la tarjeta "¿Qué has disfrutado hoy?" (`BookTimer`,
`src/components/stats/today-actions.tsx`) solo tiene "Cancelar" y
"Registrar". No hay forma de capturar una nota/cita mientras el cronómetro
corre ahí — la única vía de captura progresiva (`SessionNotebook`, feature
2026-07-29 anterior) vive dentro de la hoja completa de sesión
(`/sesion/{passId}`), a la que "Registrar" solo lleva DESPUÉS de parar y
limpiar el cronómetro (lo convierte en minutos fijos vía `?minutos=N`).

## Decisión (D1)

**No se duplica UI de notas en la tarjeta.** Se añade un botón "+ Nota" que
abre la hoja completa de sesión SIN parar el cronómetro — como la hoja ya
comparte la misma clave de `localStorage` por `passId`
(`timerStorageKey`, `src/lib/sessions/timer.ts:54` — mismo reloj entre
portada y hoja, documentado ya en el propio código), el tiempo sigue
contando al llegar. La hoja completa ya tiene `SessionTimer` y
`SessionNotebook` construidos (feature anterior) — cero UI nueva de
composición, solo un punto de entrada que no destruye el estado compartido.

Alternativa descartada: mini-compositor incrustado en la tarjeta de
portada. Habría duplicado una versión reducida de `SessionNotebook` y
obligado a decidir aparte cómo enlazar esas notas a la sesión si luego se
pulsa "Registrar" desde la tarjeta. Con la hoja completa como destino, el
enlace ya lo resuelve el mecanismo existente (`noteIds` + `addSession`).

## Cambios

### `today-actions.tsx` (`BookTimer`)

Nuevo botón "+ Nota" entre "Cancelar" y "Registrar":

```tsx
<Link
  href={sessionHref}
  className="flex flex-1 items-center justify-center rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
>
  {labels.timerNotes}
</Link>
```

Sin `clearTimer`, sin `?minutos=`: navegación pura, el reloj compartido no
se toca. `labels.timerNotes` nueva (`messages/es.json`, junto a
`timerCancel`/`timerRegister`): `"+ Nota"`.

### `book-progress-field.tsx`

El modo de duración deja de arrancar fijo en `"manual"`. Se deriva de si ya
hay cronómetro con tiempo para este pase, usando `useTimerState` (ya
existe, `src/lib/sessions/use-timer-state.ts`, seguro para hidratación vía
`useSyncExternalStore` — **no** se puede leer `localStorage` directamente
en el inicializador de `useState`, el propio comentario del hook explica
por qué: desincroniza servidor/cliente y el lint del repo prohíbe
corregirlo con un efecto).

```typescript
const timerState = useTimerState(passId);
const [durationModeOverride, setDurationModeOverride] =
  useState<"manual" | "timer" | null>(null);
const durationMode = durationModeOverride ?? (hasTime(timerState) ? "timer" : "manual");
```

Los clics manuales en las pestañas (`onClick={() => setDurationMode(mode)}`)
pasan a llamar `setDurationModeOverride(mode)` — una vez el usuario toca la
pestaña a mano, su elección manda siempre, incluso si hay cronómetro
corriendo (no le pisamos la elección explícita).

`SessionNotebook` no cambia: ya es hermano de `BookProgressField` en
`session-sheet.tsx`, no depende del modo — las notas están disponibles
entre en el modo que entre la hoja.

## Fuera de alcance

- Series/películas: `BookTimer` ya solo se monta para libros
  (`today-actions.tsx:56`), no hace falta tocar nada ahí.
- No se cambia qué pasa al pulsar "Cancelar" ni "Registrar" — ambos
  siguen igual.

## Testing

Sin lógica pura nueva relevante (el cambio es de qué prop inicial recibe un
componente y un `<Link>` sin handler) — verificación manual en navegador
real: arrancar cronómetro en portada, pulsar "+ Nota", confirmar que el
reloj de la hoja sigue corriendo desde el mismo tiempo (no desde cero) y
que el cuaderno de notas está usable de inmediato.
