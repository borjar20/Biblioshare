# Experiencias — evidencia de implementación (#1293)

**[Verificado 2026-10-02 · local + biblioshare-dev; producción no modificada]**

Rama `codex/experiencias`, base `89d82e83`. Node 22.23.1, Next 16.3.8 y React 19.2.4
del lockfile de main; sin dependencias nuevas. Diseño/plan aprobados, ejecución
continua en seis tareas y una revisión independiente final. Captura manual de planes
y recuerdos, escapadas con IDs estables, participación/presencia/favoritos propios,
galería consentida, perfil/feed y moderación con evidencia privada.

## Verificación

| Comprobación | Resultado |
|---|---|
| Vitest completo, un worker | 417 archivos, 3981 pruebas, todas pasan tras la revisión |
| TypeScript | `npx tsc --noEmit`, exit 0 |
| Lint de aplicación | 0 errores, 28 warnings previos; se excluye artefacto ignorado GitNexus (#1310) |
| Producción | `npm run build`, exit 0; E2E con `next start` en 3000 |
| Bootstrap | 279 pasos desde esquema vacío; inventario 7/7 |
| SQL local | Todas las regresiones de `npm run test:db:local`, incluidas moderación y nuevas experiencias; joint conservado en los unitarios y enums |
| SQL dev | Acceso/transiciones/borrado/participación/fotos/social y cuatro regresiones de revisión con rollback |
| Carreras locales | Ediciones: un éxito y un conflicto; publicaciones: mismo post, creado una vez |
| E2E dev | 11/11 en siete familias: captura 2, participación 2, imágenes 2, social 1, moderación 1, historial 1, retirada 2 |
| Maintenance | 4/4 tests; limpieza QA anterior de 3 objetos y final de 1, cero reintentos; cola final vacía |
| Arquitectura | `node docs/architecture/sync.mjs --check`, mapa sincronizado |

Tras la revisión, nueve E2E pasaron en la tanda integral y los dos restantes en
una repetición focalizada del mismo build. Se corrigieron dos errores del test:
localizar la tarjeta por su heading, y esperar el cierre del diálogo antes de
buscar la imagen que también aparecía en la confirmación. La configuración dedicada
`playwright.experiences.config.ts` evita el globalSetup ajeno; usa un solo worker,
sin retries. El recorrido social se repitió para conservar capturas móvil 390×844
y escritorio 1280×900. Inspección visual: estilo Paper, tabs legibles, sin overflow
horizontal. Accesibilidad focal: controles localizados por rol/etiqueta, diálogos y
formularios con nombres, foco visible y links semánticos; no es una auditoría WCAG completa.

Privacidad probada con organizador, aceptado, pendiente, tercero, bloqueado,
perfil privado, administrador y anónimo. Incluye joins directos a personas,
asistencia/favoritos y metadatos de fotos, sin IDs/autoría privada en proyecciones.
Copiar una URL y retirar permiso vuelve a dar 404/no-store. Pendientes solo reciben
resumen; marcar raíz vivida no escribe presencia de otras cuentas. Moderación
oculta descendientes, conserva retiradas independientes y evidencia ready tras
borrar la raíz; el endpoint administrativo devuelve 403 a usuarios ordinarios.

Los nuevos tests se observaron fallar antes de implementar (acciones, RPC ausentes,
feed, media). La ampliación social detectó target de comentario y notificación que
seguían visibles al privatizar; ambas regresiones se reprodujeron y corrigieron.
Dos fallos E2E fueron errores del recorrido de test: audiencia se edita después de
crear y evidencia administrativa se despliega antes de comprobar su imagen.
El aviso de Next «destination stream closed early» aparece en logs durante navegación
entre páginas; los recorridos y sus aserciones pasan. No se ha cambiado el manejo
general de streaming de Next.

## Revisión independiente y correcciones finales

Una revisión completa `89d82e83 → c1578ea7` identificó cero Critical, cuatro Important
y dos Minor. Se confirmó cada Important, se corrigieron en una pasada y se volvió
a ejecutar la suite completa; no se solicitó otra revisión del mismo diff.

| Hallazgo importante | Prueba RED → GREEN |
|---|---|
| Bloqueo impedía revocar identidad/salir, manteniendo atribución pública | `experiences_withdrawal.sql` reproduce ambos sentidos; comprueba también perfil/asistencia/favoritos y raíz privada. Dos E2E verifican controles accesibles desde el hub sin abrir el grupo. |
| SECURITY DEFINER permitía denunciar una raíz invisible | `experiences_report_access.sql`: tercero, invitado pendiente y miembro retirado rechazados; miembro visible permitido. Pendiente rechazado también con raíz profile. |
| Selector de acompañantes limitado a una página | `experiences_companion_history.sql` y E2E de 23 recuerdos: Ana antigua aparece, se puede cambiar a Luis y conservar opciones tras filtros vacíos. Unitario supera el límite REST de 1000 filas. |
| Fotos del mismo día indistinguibles al salir | SQL de autorización del autor, dos unitarios de entrega y E2E con dos aportaciones: preview en lista/confirmación, otra cuenta 404, se borra la elegida conservando la otra. URL ordinaria sigue dando 404. |

Menores diferidos: etiqueta de experiencia relacionada en español [#1321](https://github.com/borjar20/Biblioshare/issues/1321)
y array runtime `club_post_kind` [#1322](https://github.com/borjar20/Biblioshare/issues/1322).
No se encontró consumidor del array afectado; su unión TypeScript permanece correcta.
Catálogo externo, fusión y filtro entre hobbies conservan el alcance pendiente de #1293.

## Esquema y advisors

Migraciones canónicas, en este orden:

1. `20261002092735_experiences_enums.sql`
2. `20261002092737_experiences_core.sql`
3. `20261002095236_experiences_deletion.sql`
4. `20261002105627_experiences_participation.sql`
5. `20261002112531_experiences_photo_mutations.sql`
6. `20261002120712_experiences_social_visibility.sql`
7. `20261002125917_experiences_advisor_hardening.sql`
8. `20261002132635_experiences_review_fixes.sql`

Enums y consumidores en transacciones diferentes. Dev/local tienen estos objetos;
la proyección de portada se aplicó además como definición suplementaria en dev al
componer la migración de imágenes. Se verifican objetos reales, no solo el ledger.
Se conservan cuerpos previos de helpers/moderación y contratos joint/joint_viewing.
Generación de contratos nuevos desde local; la revisión registra aparte la deriva
del array runtime ajeno (#1322). El bootstrap
omite el enum previo mentioned, deriva ajena registrada en #1299.

Comprobación de ACL: seis tablas RLS, clientes sin INSERT/UPDATE/DELETE, cero EXECUTE
de PUBLIC en contratos nuevos, helpers de mantenimiento/evidencia solo servicio.
No se añadieron columnas a tablas anteriores: no se amplían grants por columna.
Advisors introducidos corregidos: índice FK de asistencia, initplan auth.uid en fotos
y policy false de la cola. SECURITY DEFINER de proyecciones públicas es deliberado
y pasa los gates multiusuario; los RPC autenticados de retirada/vista previa están
cerrados a anon y PUBLIC. El índice FK de portada «unused» se conserva.
Referencia del advisor: [lecturas definidoras anónimas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Repetir y limpiar

```powershell
npm run test -- --maxWorkers=1 --no-file-parallelism
npx tsc --noEmit
npm run lint -- --ignore-pattern .gitnexus
npm run build
npx playwright test --config playwright.experiences.config.ts
npm run test:db:bootstrap
npm run test:db:local
node docs/architecture/sync.mjs --check
```

El runner espera `.env.local` de desarrollo y credenciales QA persistentes para
captura; los otros recorridos usan actores sintéticos `qa_exp_<hex>@example.invalid`.
Nunca imprimir tokens/contraseñas. No apuntar fixtures a producción.
La evidencia privada exige ejecutar `e2e/fixtures/experiences-moderation-cleanup.sql`
en DEV/local como postgres tras las pruebas, y después la limpieza de Storage:

```powershell
node scripts/experiences/cleanup-pending-photos.mjs --project=dev --kind=deleted --hours=1 --execute
```

La limpieza solo selecciona raíces QA del namespace de Experiencias, conserva
rutas en cola antes de retirar evidencia y no expone un RPC destructivo de auditoría.
Se comprobaron cero actores sintéticos, raíces QA, evidencia QA y rutas en cola.
Las cuentas QA persistentes se conservan. Servidores y contenedor local propios
se detienen al cerrar; otros worktrees no se tocan.

## Release y alcance pendiente

Código y migraciones preparados; merge, migraciones de producción y despliegue
no ejecutados. Verificar definiciones reales de helpers previos en producción antes
de aplicar las ocho migraciones y repetir privacidad/media tras el despliegue.
Seguimiento de release y ampliaciones en #1293: catálogo externo de eventos/lugares,
fusión de recuerdos independientes y filtro de una persona entre hobbies.
