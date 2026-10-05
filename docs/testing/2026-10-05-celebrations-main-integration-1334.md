# Celebraciones: integración con main de #1334, #1369 y #1385

**[Corte de integración · verificado el 2026-10-05 contra código y checks locales;
CI del candidato final y despliegue pendientes al registrar este corte.]**

El candidato de PR #1364 incorpora los consumidores recuperables de #1334,
los diagnósticos vigentes de #1369 (PR #1372) y ChromeBoundary de #1385 (PR
#1407). Se integra `main` `f1205b958861170c8ae2a5af3d9aa4030aebaa53` sobre el
padre `c75dc40902b09c1ed01c6d9e4593e99c941f61c3` después de sus dos merges
normales, sin bypass ni auto-merge.

Los siete conflictos eran documentales. Se conservan los apartados de Notas
en el margen y Lugares de Experiencias, sus siete migraciones y las aportaciones
de tipos, baseline, verificación SQL y workflows. Las colecciones del mapa se
combinan desde las tres versiones fijadas; los dos invariantes nuevos de
celebraciones y privacidad del margen sobreviven. El mapa valida con 141 nodos,
280 aristas, 30 flujos y 267 pasos. Se conserva la plantilla HTML y se re-embebe
el JSON integrado.

El código de `src/lib/celebrations`, `src/components/celebrations`, AppShell,
ChromeBoundary, el bootstrap y sus contratos, el cutover y su activador, y
`scripts/ci-local.mjs` conserva sus blobs del padre probado. No se añade una
migración ni se ejecuta SQL en dev/producción durante esta integración. Los
objetos productivos de #1334 ya estaban activos en el corte del 2026-10-04.

## Gates observados

| Corte | Resultado |
| --- | --- |
| PR #1407, head82b82d0/base2c487a8, CI37311523422 | 477 archivos, 4744 unitarios, 20 contratos Node y 168 recorridos PASS |
| PR #1372, head71fd8bf/base3262374, CI37313822197 | 477 archivos, 4744 unitarios, 20 contratos Node, 291 pasos SQL y 168 recorridos PASS |
| Integración con mainf1205, contrato Node | 20/20 PASS |
| Integración con mainf1205, consumidores/overlay/chrome | 6 archivos, 90/90 unitarios PASS |
| Integración con mainf1205, route typegen + tsc | PASS |
| Integración con mainf1205, mapa y whitespace | PASS |
| CI final de PR #1364 y despliegue | Pendientes en este corte; se registra su resultado en la PR |

Los checks de salud originales y los dos anchos MTG siguen activos. El recorrido
#754 pasó en ambas CI citadas; no se infiere por ello la causa de sus fallos
anteriores. Los logs y recibos de merges/CI y los snapshots de los conflictos
se conservan en el checkout principal, bajo
`.scratch/ticket-campaign/20261005-resume/celebrations-main-delivery-r1/`.

## Límites conservados

La [prueba Native de #1385](2026-10-05-chrome-hydration-1385.md) pasa sus cuatro
recorridos focales con cero errores de hidratación. Mantiene GLOBAL FAIL por
16 GET RSC cancelados sin clasificación (#1301) y el FAIL del inventario completo
de `.next`: 56 archivos nuevos de route-cache y 2445 previos intactos. Los
recibos originales permanecen sellados; la parada normal conserva los backups.

La [activación productiva](2026-10-04-celebrations-prod-expansion-1334.md)
acredita el esquema, permisos y conservación de datos del corte de las
20:16:22 UTC; no acredita una animación con sesión real en producción. El
[G4 local](2026-10-03-recoverable-celebrations-1334.md) y las tres fronteras
pendientes de #1356 mantienen su alcance. La deuda de carriers #1355 y la
auditoría global #1301 siguen abiertas. No se reclama aceptación de Android,
producción autenticada ni de toda la red.
