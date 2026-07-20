# Importar desde el onboarding — diseño

Fecha: 2026-07-20 · Continúa [`2026-07-20-onboarding-design.md`](./2026-07-20-onboarding-design.md) (asistente de 3 pasos, PR #100, mergeado)

## 1. Problema

Quien se registra viniendo de Goodreads o Letterboxd ya tiene su biblioteca hecha
en otro sitio. Hoy el asistente le ofrece una **rejilla de sugerencias** para ir
añadiendo títulos de uno en uno, y la importación vive en `/importar`, una ruta
que no descubrirá hasta mucho después — si es que la descubre.

Es el momento de máxima intención: acaba de crear la cuenta, quiere ver su
biblioteca dentro.

### Lo que condiciona el diseño

| Hecho | Consecuencia |
|---|---|
| Una importación puede tardar **minutos** (lotes de 20 filas, 5 en paralelo, con llamadas a OpenLibrary/TMDB por fila sin cachear; tope 3.000 filas) | El paso **no puede fingir que es instantáneo**: necesita barra de progreso y bloquear el «Continuar» |
| El bucle lo conduce el **cliente** | Si cierra la pestaña, se corta. Hay que avisarlo |
| `import-form.tsx` mezcla ese bucle con su UI (172 líneas) | Embeber sin más **duplicaría** la lógica de lotes |
| Las filas sin match se guardan **una a una, a mano**, y resolverlas es de `collaborator+` | En el onboarding es inviable: 40 filas sin match = 40 clics, y quien acaba de registrarse **nunca** es colaborador |

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| **D1** | **La importación vive DENTRO del paso 2**, como alternativa a la rejilla — no como un cuarto paso. | Importar solo aplica a quien viene de otra app; un paso propio alargaría el asistente para todo el mundo. El paso 2 ya es «llena tu biblioteca»: importar es otra forma de lo mismo. |
| **D2** | **Se ejecuta en el propio paso**, con barra de progreso y «Continuar» bloqueado hasta terminar. | Decisión del usuario. Mantiene el flujo continuo, sin mandarlo a otra ruta y traerlo de vuelta. |
| **D3** | **El bucle de lotes se extrae a un hook compartido**; `/importar` y el onboarding lo consumen. | Duplicar 172 líneas de orquestación es garantía de que las dos copias divergan. `/importar` conserva su pantalla completa; el asistente pinta una versión compacta. |
| **D4** | **Las filas sin match se guardan TODAS de golpe**, sin intervención, y solo se reporta el recuento. | Quita los N clics y respeta el gate de `collaborator+` intacto: no se abre el catálogo compartido a datos sin verificar. |
| **D5** | **Lo ya comprometido se queda** si abandona a mitad; se avisa de no cerrar la pestaña. | Cada lote es un commit y reimportar es idempotente. Revertir a medias sería peor: perdería lo que ya tiene. |

### Descartado

- **Crear la obra automáticamente desde el CSV** para las filas sin match. Daría biblioteca completa al instante, pero abre el catálogo **compartido** a datos sin verificar de cualquiera y lo llena de duplicados con el título mal escrito. Es justo lo que protege el gate de colaborador.
- **Un cuarto paso dedicado** (ver D1).
- **Ramificar el asistente** según «¿vienes de otra app?» en el paso 1: haría el flujo condicional y más difícil de probar, a cambio de poco.

## 3. La pantalla

El paso 2 pasa a ofrecer dos caminos:

```
Paso 2 · «Añade algo para empezar»

  ┌──────────────────────────────────────────┐
  │  ¿Vienes de Goodreads o Letterboxd?      │
  │  [ Importar mi biblioteca ]              │   ← despliega el subidor aquí
  └──────────────────────────────────────────┘
  ────────────  o elige de aquí  ────────────
  [ rejilla de portadas de siempre ]
```

Al pulsar, el subidor **sustituye a la rejilla dentro de la misma tarjeta** —
sin cambiar de URL ni de paso. Tres estados:

1. **Subir** — selector de fichero (`.csv`), con la ayuda de qué exportar de cada
   servicio (las cadenas ya existen: `import.help.goodreads` / `.letterboxd`).
2. **Procesando** — barra con «N de M», y aviso de **no cerrar la pestaña**.
   «Continuar» y «Saltar» deshabilitados.
3. **Resumen** — «142 títulos añadidos · 8 necesitan revisión, te avisamos cuando
   estén». Sin formularios ni listas de filas. «Continuar» se rehabilita.

Si el usuario prefiere no importar, la rejilla sigue ahí: el subidor es opt-in.

## 4. Arquitectura

### 4.1 El hook compartido

Se extrae de `import-form.tsx` a `src/lib/import/use-import-run.ts`:

```
useImportRun() → {
  start(parsed),                 // arranca el bucle de lotes
  phase: "idle"|"processing"|"done",
  processed, total,              // para la barra
  results,                       // ImportRowResult[]
}
```

Conserva el troceo actual (`BATCH_SIZE = 20` en cliente, `BATCH_CONCURRENCY = 5`
en servidor). **No se cambia la mecánica de lotes en esta spec**: es
independiente y ya funciona.

`/importar` pasa a consumirlo sin cambiar su aspecto; el onboarding estrena
`step-titles-import.tsx`, compacto.

### 4.2 Guardar las filas sin match en bloque

Acción nueva en `src/app/importar/actions.ts`:

```
saveUnmatchedBatch(itemType, rows: ImportRow[]) → { saved: number } | { error }
```

Un solo `insert` múltiple en `pending_import_rows` (`user_id`, `item_type`,
`payload` jsonb) en vez de N llamadas. La existente `saveUnmatchedForReview` se
mantiene: es la que usa `/importar` para el guardado fila a fila, que ahí sí
tiene sentido porque el usuario está revisando.

El asistente la llama **automáticamente** al acabar el bucle, con todas las filas
`outcome === "unmatched"`.

## 5. Casos límite

| Caso | Comportamiento |
|---|---|
| Fichero no reconocido | Mensaje de error en el propio paso; la rejilla vuelve a estar disponible |
| CSV con más de 3.000 filas | El error `tooManyRows` que ya existe, sin tocar el tope |
| Cero filas importadas (todo sin match) | Resumen honesto: «0 añadidos · N necesitan revisión». No se finge éxito |
| Cierra la pestaña a mitad | Lo comprometido se queda. Al volver, el paso 2 arranca limpio y reimportar no duplica |
| Ya tenía títulos de la rejilla | Conviven: el import no borra nada |
| Import termina con 0 sin match | No se menciona la revisión |

## 6. Verificación

**Unidad**
- `use-import-run`: trocea en lotes del tamaño correcto, acumula resultados, y `processed` avanza por lote.
- `saveUnmatchedBatch`: agrupa en un solo insert; con lista vacía no llama a la BD.

**E2E** — hoy **no hay ni un solo e2e de importación**, así que esto cubre un hueco real:
- Un CSV de Goodreads pequeño (3-4 filas, con al menos una que no vaya a matchear) recorrido desde el paso 2 del asistente.
- Comprobar que al terminar el resumen cuadra, y que los títulos aparecen luego en la biblioteca.
- Limpieza de los datos creados, como manda `docs/TESTING.md`.

⚠️ La suite no se corre entera de una tacada (`docs/TRAMPAS.md` §5).

## 7. Dependencias

- **PR #100** (asistente de 3 pasos) — **mergeada**, y su migración aplicada en producción.
- **PR #101** (retirar Bookmory) — **mergeada**. Por eso el subidor acepta solo `.csv`.
- **PR #102** (revisionados de Letterboxd) — **abierta**. La afirmación de D5 de que «reimportar es idempotente» **depende de ella**: sin ese arreglo, reimportar un `diary.csv` pierde los revisionados. **Mergear la #102 antes de implementar esta spec.**

## 8. Fuera de alcance

Resolver filas sin match desde el asistente (es de `collaborator+`), elegir qué
filas importar, importar desde un servicio por API en vez de fichero, y cambiar
la mecánica de lotes o el tope de 3.000 filas.
