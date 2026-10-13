# Entre nosotros: atlas, evidencia de F1

`[Histórico · verificado 2026-10-13]`

Verificación de la fase F1 del rediseño del atlas (`/comunidad/entre-nosotros`, a sangre, siempre oscuro, `<canvas>`).

## Build usado

- Commit `babf2391` (rama `claude/entre-nosotros-redesign-74ece2`), `npm run build` + `npm run start` en el puerto 3000, Node v22.23.2.
- Supabase **dev** (`.env.local` del worktree). Fixture `withComparisonFixture(…, { integrated: true })`: 10 personas; Tú, Beatriz QA y Carlos QA comparten 30 libros + una película + una serie. Grupo «Atlas QA» creado por la UI.
- Servidor parado al terminar; el 3000 queda libre.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errores, 31 warnings preexistentes |
| `npx vitest run` | **574 ficheros, 6018 pruebas, todas pasan** |
| e2e `entre-nosotros-atlas.spec.ts` (chromium + mobile, build de producción) | 2 passed, 2 skipped (los skips son por proyecto: cada test se salta en el otro proyecto) |
| e2e `entre-nosotros.spec.ts -g "CRUD\|profile\|transport"` | 3 passed |
| e2e `entre-nosotros.spec.ts -g "conflict\|isolation"` | 2 passed |
| e2e `entre-nosotros.spec.ts -g "LOCAL ONLY"` | falla contra dev: preexistente, es un `expect` del origen de Supabase (`127.0.0.1:54321`), no un `test.skip`. Solo corre bien contra Supabase local |
| `npx tsx --test e2e/support/club-round-fixture.test.ts` | 9 pass |

Los e2e son los de la Task 9 (informe en `.superpowers/sdd/task-9-report.md`), con las dos rondas de arreglos posteriores: las caras del atlas sobreviven al cambio de formato (`8b8b60ea`) y, si nadie de la selección sigue en el cruce, vuelven todas (`cb0cfcf7`). Tras la segunda ronda no se repitieron los e2e; los últimos fueron tras la primera. Los commits posteriores (`babf2391`, extensión finita del atlas sin personas) solo están cubiertos por los unitarios de esta pasada. Las capturas sí salen del build de `babf2391`.

## Capturas

Carpeta `docs/testing/assets/2026-10-13-entre-nosotros-atlas-f1/`. Generadas con un script Playwright desechable (no commiteado).

Escritorio 1280×800:
- [desktop-map.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-map.png): mapa encajado (zoom de encaje).
- [desktop-covers.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-covers.png): portadas, zoom 2,35.
- [desktop-titles.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-titles.png): títulos, zoom 4,2 (> 3,2).
- [desktop-tooltip.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-tooltip.png): tooltip sobre una obra.

Móvil (Pixel 7, con toque):
- [mobile-map.png](assets/2026-10-13-entre-nosotros-atlas-f1/mobile-map.png)
- [mobile-sheet.png](assets/2026-10-13-entre-nosotros-atlas-f1/mobile-sheet.png): hoja de una obra («Abrir ficha», «Cerrar»).
- [mobile-groups.png](assets/2026-10-13-entre-nosotros-atlas-f1/mobile-groups.png): hoja de grupos (selector, Editar grupo, Crear grupo, Actualizar).

## Observaciones visuales (sin tocar código)

Funciona: barra superior, resumen «30 obras en común entre Tú, Beatriz QA y Carlos QA», caras de colores, ejes y nube de puntos; el vuelo al grupo pasa de puntos a portadas y a títulos; el tooltip lista quién tiene la obra; no hay scroll horizontal en móvil (comprobado por el e2e).

Detalles dudosos:
1. **Móvil, fila de caras recortada**: el chip «Tú» tiene el aro cortado en el borde izquierdo y el inferior de la fila (los tres chips se ven con el borde inferior recortado). Parece el `overflow` del contenedor desplazable.
2. **Móvil, eje sobre el texto**: con zoom en el grupo, el eje vertical de «Tú» sube por encima del mapa y atraviesa el resumen y la fila de caras (`mobile-sheet.png`).
3. **Escritorio, títulos diminutos**: a zoom 4,2 las etiquetas `qa_comp_motion_NN` miden unos 6-7 px y cuesta leerlas; el zoom del vuelo aterriza ya en 4,2, así que el nivel «portadas» (1,1 a 3,2) solo se ve alejando a mano.
4. **Escritorio, tooltip**: tapa las obras vecinas y las portadas de la derecha (aceptable para un tooltip, pero conviene mirarlo).
5. **Móvil, hoja de grupos**: el texto inferior («Solo obras visibles para ti…») queda al ras del borde de la captura; no se ve el cierre de la hoja, puede quedar recortada.
6. **Móvil, sin botones de zoom**: no hay Acercar/Alejar/Ver todo (probable decisión de diseño, solo gestos).
7. **Carga**: antes de que llegue la comparación se ve el loader «Cargando comparación…» (visto en una primera captura); la captura final espera a que desaparezca.
8. **Portadas**: son placeholders de color (sin imagen), como se espera en F1.

## No verificado

- Dispositivo real (táctil, gestos de pellizco, rendimiento de la hoja).
- fps con ~1.000 obras: solo se probó con 30 obras y un par más.
- Covers reales: son de F4; aquí solo se ven placeholders.
- Android (Capacitor) y lectores de pantalla en el atlas.
- Test LOCAL ONLY contra Supabase local.
- Pérdida de cobertura: el e2e de «handoff» de carga del lienzo antiguo se borró (ver informe de Task 9); no hay equivalente para el atlas.
