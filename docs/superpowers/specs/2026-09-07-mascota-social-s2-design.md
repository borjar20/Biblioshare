# Mascota social: nivel en S1 y perfil S2

> [Implementado y verificado en dev el 2026-09-07 · producción pendiente]
> Alcance solicitado por José Ángel. Migraciones y pruebas autorizadas solo en dev.

## Alcance y decisiones

José Ángel acepta S1 por la respuesta de quienes ya la usan. Esto no atribuye
una nueva ejecución de la matriz técnica ni un número de participantes.
Solicita mostrar el nivel en la madriguera y comenzar S2.

- S1 muestra `Nivel N` bajo cada mascota y en su tarjeta, incluida la propia.
  El nivel ajeno es `pet_state.last_level`, la última derivación guardada por
  `/mascota`, igual que la etapa social guardada. No se recalculan atributos
  ajenos ni se cambian niveles. Se conserva el orden diario, sin ranking.
- S2 muestra sprite, nombre, clase y etapa en una ficha compacta dentro de la
  cabecera del perfil. El nivel se añade solo a la madriguera, como se pidió.
- La mascota aparece si existe y `can_view_profile` permite ver al dueño,
  respetando bloqueos. Incluye bellotas; no crea mascotas al visitar perfiles.
- El humor y la actividad permanecen privados. `companion_hidden` sigue siendo
  la preferencia de la compañera flotante, no un interruptor de privacidad social.
- El perfil carga esta pieza bajo Suspense propio, sin caché compartida. Un fallo
  de lectura omite la pieza opcional y no rompe la cabecera.
- La imagen OG usa exclusivamente el contexto anónimo: nunca incorpora mascotas
  o estadísticas de perfiles privados, aunque quien solicite la imagen sea su
  dueño o un seguidor. Se vuelve a consultar al generarla y no se almacena en
  cachés HTTP de la aplicación. Las copias de servicios externos son ajenas a ella.
- OG reutiliza un frame idle del sheet existente; no genera ni sustituye arte.
  El enlace NFC ya lleva al perfil: no se cambia su resolución.
- RPC de perfil con una fila como máximo y columnas exactas: nombre, clase,
  etapa. Ninguna política ni grant de tabla se amplía. La lectura de madriguera
  añade únicamente el nivel a su proyección existente.

## Aceptación

1. El nivel ajeno guardado y el propio aparecen en lista y tarjeta sin ordenar
   por nivel ni revelar humor/XP/actividad.
2. Perfil público: anónimo y usuario ven la mascota. Privado: solo dueño y
   seguidor aceptado. Pendiente, no seguidor y bloqueados no la ven.
3. Sin mascota no hay ficha ni hueco reservado; bellota, seis clases y nombres
   largos se presentan correctamente en móvil y escritorio.
4. La imagen OG muestra mascota pública con nombre y clase, y omite la privada
   también con cookies de una sesión autorizada. No muestra el spritesheet entero.
5. Fallo de RPC o de lectura del sprite no rompe perfil ni OG.
6. Pasan tipos, pruebas pertinentes y revisión; la verificación distingue dev
   de producción. Aplicar en producción requiere autorización separada.

## Verificación del 2026-09-07

- Node 22.23.1; TypeScript y ESLint de los archivos afectados: PASS.
- Vitest completo: 327 ficheros, 3346 tests, PASS. Pruebas de inventario y
  orden de migraciones: 7 PASS.
- Build de producción Next.js 16.3.0 / Turbopack: 70/70 páginas, PASS.
- Playwright contra `next start` con biblioshare-dev: primera pasada 5/5 PASS;
  pasada final 5/5 PASS en 36,8 s, sin reintentos automáticos.
  Incluye API de apariencia con sesiones reales, público/privado/seguimiento/
  bloqueos, ausencia de mascota y bellota; nivel guardado; móvil y escritorio;
  OG anónimo idéntico al autenticado para perfil privado; límite de 60/65 vecinas.
- Capturas de ficha, OG público y privado, madriguera móvil y escritorio
  inspeccionadas. OG recorta un solo frame del arte existente.
- Funciones y ACL de la migración comprobadas en pg_proc en dev. Advisor de
  seguridad sin avisos que mencionen las funciones nuevas; no se afirma ausencia
  de avisos preexistentes del proyecto. Cuentas desechables limpiadas por los tests.
- Durante la navegación reaparece HANGING_PROMISE_REJECTION en `/mascota`,
  coincidente con el seguimiento abierto #1098. Los cinco recorridos pasan;
  no se atribuye una causa ni se considera corregido aquí.

Artefactos locales: `.superpowers/social-s2-unit.log`, `social-s2-build.log`,
`social-s2-e2e.log`, `social-s2-server.err.log` y `social-s2-browser/`.
No se ha aplicado la migración en producción ni se ha verificado allí la UI nueva.

### FAIL intermedio conservado

Tras ajustar el fixture de la vecina adulta a nivel 12 y añadir una aserción de
UI, una repetición del caso «A ve a B» agotó 120 s. La captura final mostraba
«Perfil no encontrado»; no identifica el paso ni demuestra la causa. Se detectó
una precondición incompleta del helper: creaba perfiles sin `onboarded_at`.
Se explicita onboarding completado para estos usuarios de prueba. La siguiente
pasada completa da 5/5 PASS; esta correlación no prueba por sí sola el origen
del timeout. Log conservado: `.superpowers/social-s2-level-ui.log`, contexto en
`social-s2-browser/mascota-madriguera-Madrigu-41b49--después-junto-a-su-mascota-chromium/error-context.md`.
La evidencia final usa rutas nuevas: `.superpowers/social-s2-e2e-final.log` y
`.superpowers/social-s2-browser-final/`.

## Revisión independiente

Comparación con `d32f784` en dos revisiones independientes según code-review:
alcance sin hallazgos; convenciones detectó la omisión de `pet_level` en los
tipos de la nueva RPC. Corregida y comprobada con TypeScript. La duplicación
breve de validación de etapa se mantiene local en los dos lectores; no requiere
una abstracción adicional para este alcance. No quedan hallazgos de producto.
