# Celebraciones: integración con main de #1334, #1369 y #1385

**[Corte de entrega · verificado el 2026-10-05 contra main8424, CI final,
consumidor público y metadata de dev/producción. Presentación autenticada en
producción no observada.]**

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
migración ni se ejecuta DDL/DML en dev/producción durante esta integración. Los
objetos productivos de #1334 ya estaban activos en el corte del 2026-10-04;
la comprobación posterior de entrega consulta sólo metadata.

## Gates observados

| Corte | Resultado |
| --- | --- |
| PR #1407, head82b82d0/base2c487a8, CI37311523422 | 477 archivos, 4744 unitarios, 20 contratos Node y 168 recorridos PASS |
| PR #1372, head71fd8bf/base3262374, CI37313822197 | 477 archivos, 4744 unitarios, 20 contratos Node, 291 pasos SQL y 168 recorridos PASS |
| Integración con mainf1205, contrato Node | 20/20 PASS |
| Integración con mainf1205, consumidores/overlay/chrome | 6 archivos, 90/90 unitarios PASS |
| Integración con mainf1205, route typegen + tsc | PASS |
| Integración con mainf1205, mapa y whitespace | PASS |
| CI final de PR #1364, head0c663a3/basef1205 | Tests37317754111: 496 archivos/4873 unitarios, 20 contratos Node + 9 de fixture, 298 pasos SQL y 168/168 recorridos PASS |
| Bootstrap final37317754201 y ocho checks de PR #1364 | 298 pasos PASS; Tests, bootstrap, CodeQL y Vercel SUCCESS |
| Fusión normal de PR #1364 en main8424 | 2026-10-05 13:50:21 UTC; árbol idéntico al candidato probado |
| Entrega posterior | GitHub deployment6860799429 success; consumidor público y metadata PASS dentro del alcance siguiente |

Los checks de salud originales y los dos anchos MTG siguen activos. El recorrido
#754 pasó en ambas CI citadas; no se infiere por ello la causa de sus fallos
anteriores. Los logs y recibos de merges/CI y los snapshots de los conflictos
se conservan en el checkout principal, bajo
`.scratch/ticket-campaign/20261005-resume/celebrations-main-delivery-r1/`.

## Entrega y observación posterior

La revisión independiente final del candidato `0c663a3` pasa sin pérdidas:
156 blobs exclusivos, siete migraciones de main, tipos, baseline y mapa
preservados. Sello del informe/manifest:
`5cb89c4b87603246c7139dea474273e32183298cd9c515ce88efddcfceec58a6`.
La CI final está en [Tests37317754111](https://github.com/borjar20/Biblioshare/actions/runs/37317754111)
y [bootstrap37317754201](https://github.com/borjar20/Biblioshare/actions/runs/37317754201).
Main `8424eeccd1e906cb9fcf93d309832cdc927fb3f0` conserva el árbol probado
`fb875b85fc2770f57650b41b1aaeadbc4586a45e`.

GitHub registra deployment `6860799429`, entorno Production, para ese commit,
con status success a las 13:52:03 UTC. La URL habitual
[https://biblioshare-nine.vercel.app/](https://biblioshare-nine.vercel.app/)
devuelve la aplicación sin cookies y carga el consumidor claim/ACK/release,
incluidas las guardas de generación/identidad de #1369. BUILD_ID público
`jVsRogOjndJOARrRJex7U`; recurso `1zgyt7-9tmbvz.js`, SHA-256
`d5eaa350e802d6b90ea34fcffe21f0e184854e92c315e276d0672815a25da713`.
El host individual del deployment redirige al login protegido de Vercel:
su HTTP200 y sus scripts no acreditan entrega de Biblioshare. La API del equipo
responde403; no se usa bypass ni se verifica por esa API la correspondencia
exacta BUILD_ID/SHA. El registro GitHub y el consumidor público son evidencias
independientes con ese límite.

A las 13:58 UTC se comprueban los objetos reales de dev y producción: RLS,
11 columnas con 33 grants authenticated, cuatro RPC INVOKER con EXECUTE sólo
authenticated y mismas definiciones MD5. No se leen filas privadas ni se
reaplican las fases productivas. Recibo metadata SHA-256
`6aa464baefe2648accdb66a274f1e3fd79e663187caabf7d898306aaeb30295a`;
recibo público SHA-256
`e45a45a5c7162a9b80213eee35bfd5a34d94b23222913918ab4e6b65552a6529`.
No se acredita Auth/animación real en producción.

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
