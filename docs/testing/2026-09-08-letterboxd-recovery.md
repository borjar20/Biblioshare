# Recuperación Letterboxd #1151–#1159 — validación local

[Verificado · 2026-09-08 · datos sintéticos · sin aplicación remota]

Implementación basada en la especificación aprobada
`docs/superpowers/specs/2026-09-08-letterboxd-recovery-spec.md` (#1150).
El usuario autorizó añadir migraciones y probarlas en una base local desechable.
No se aplicó la migración en dev o producción ni se reparó una cuenta real.

## Resultado y cobertura

| Tickets | Comportamiento y comprobación |
| --- | --- |
| #1151 | Worker registra fichas TMDB nuevas completas, sin depender de abrir el detalle. Fixture de 940 películas y catálogo inicialmente vacío salvo 25 locales. |
| #1152 | Fallos temporal/permanente distinguibles, estado parcial y máximo de tres intentos; reintento y recibos idempotentes comprobados en SQL y navegador. |
| #1153 | Asociación propuesta por identidad, fecha y nota; completar huecos conserva valores locales. SQL verifica procedencia, deshacer, reimportación y cambios de política intercalados. |
| #1154 | Dos homónimas distinguibles por cartel, género, director, duración y sinopsis; identidad persistente e información ausente distinta de error. Carteles sintéticos cargados a 390×844, sin desbordamiento horizontal. |
| #1155 | Selección explícita de 25 propuestas entre páginas y filtros; cancelar no escribe; plan selecciona también un reintento y una ficha incompleta. |
| #1156 | Comparación por campo, efectos de pendientes y pases nuevos, confirmación versionada y resultados por fila; SQL comprueba fecha ausente, conflicto concurrente y fila con pase anterior y nuevo. |
| #1157 | Plan de reparación de solo lectura; la ficha deliberadamente vaciada sigue vacía al consultar y seleccionar el plan. |
| #1158 | Confirmar el plan restaura la ficha y completa asociaciones; deshacer protege ediciones posteriores y restaura política de procedencia. |
| #1159 | Fixture ≥940, dos cuentas, build de producción, fallos de proveedor, salida de la página durante el worker, comparación, reparación y deshacer; regresiones ZIP anteriores incluidas. |

El primer procesamiento produce 912 filas incorporadas, 25 conflictos, 2 errores y una
ambigua. Tras confirmar 27 acciones del plan, elegir la homónima y descartar el error
permanente: 941 pases (940 completados y un pendiente), incluido un visionado sin fecha.
Deshacer devuelve el historial a los 25 pases locales iniciales. La segunda cuenta no
puede consultar las filas ni el plan de la primera. Los usuarios y películas sintéticos
se eliminan al terminar cada prueba.

## Checks ejecutados

| Check | Resultado |
| --- | --- |
| `npm test -- --maxWorkers=2` | PASS: 342 archivos, 3.439 pruebas, 35,37 s. |
| `npx tsc --noEmit` | PASS. |
| ESLint sobre archivos de implementación y prueba afectados | PASS. |
| `npm run test:db:bootstrap` | PASS: 7 pruebas. |
| Supabase local reconstruido desde cero | PASS: 250 migraciones, incluida `20260908151906_letterboxd_recovery.sql`. |
| `node scripts/db/verify.mjs` | PASS: contratos SQL, RLS/permisos y concurrencia existente; incluye los dos archivos SQL de Letterboxd. |
| `supabase/tests/letterboxd_recovery.sql` | PASS adicional tras añadir protección de políticas intercaladas; rollback completo. |
| `node scripts/ci-local.mjs build` | PASS: build de producción Next 16.3.0. |
| `node scripts/ci-local.mjs smoke letterboxd-recovery.spec.ts letterboxd-archive.spec.ts` | PASS: 3 pruebas, 46 s; recuperación 37,3 s. |
| Revisión independiente de estándares y especificación | Hallazgos corregidos y revisión final sin pendientes. |

Los fallos detectados por revisión incluían borrado de fecha ausente, omisión de pases
nuevos en una fila mixta, comprobación de dueño previa al worker y restauración de
políticas de procedencia. Tienen corrección y cobertura en los contratos SQL o flujo integrado.

## Evidencia y límites

Artefactos locales, ignorados por Git, bajo `.superpowers/`:

- `letterboxd-recovery-unit-final.log`, `letterboxd-recovery-db-final.log`,
  `letterboxd-recovery-build-final.log`, `letterboxd-recovery-v006.log`.
- `letterboxd-recovery/e2e-v006/`: captura `candidates-mobile.png` inspeccionada visualmente.
- `e2e-v003` y `e2e-v004`: FAIL conservado de carga de carteles sintéticos. La ruta de
  imágenes se solicita directamente desde el navegador; se corrigió la simulación de
  esa frontera, sin suprimir la comprobación `naturalWidth > 0`.
- `v005`: error del intérprete por `import.meta` en el entorno CommonJS de Playwright;
  corregido a `__filename`; no se cambió el comportamiento del producto.

Durante las pruebas aparecen avisos `HANGING_PROMISE_REJECTION` de Auth/PPR en varias
rutas. No impiden estos tres flujos. Existe investigación abierta en
[#1098](https://github.com/borjar20/Biblioshare/issues/1098) y
[#1126](https://github.com/borjar20/Biblioshare/issues/1126); esta ejecución no determina
que la causa sea idéntica ni demuestra que esté resuelta.

Los proveedores externos están simulados: estas pruebas demuestran el contrato local,
no la disponibilidad actual de TMDB. Quedan pendientes publicación, migración dev/prod
y aceptación con el plan concreto de una cuenta real, rastreadas en #1150–#1159.
