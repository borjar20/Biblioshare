# Experiencias — álbum social

**[Verificado 2026-10-03 · UI local + biblioshare-dev; producción pendiente]**

Delta sobre la [implementación del 2 de octubre](2026-10-02-experiencias.md), en
`codex/experiencias`, PR [#1323](https://github.com/borjar20/Biblioshare/pull/1323).
Node 22.23.1, Next 16.3.8 y React 19.2.4 del lockfile existente. No cambia
esquema, RPC, RLS, endpoints de fotos, dependencias ni caché de datos de sesión.

## Recorrido verificado

El hub propone actividades con arte propio y muestra las invitaciones antes del
archivo. La captura inicial pide actividad, nombre y estado; lugar y fechas son
opcionales y se despliegan. El recuerdo reúne portada, acompañantes, galería y
recorrido. Añadir o editar un momento sucede en una hoja contextual; compartir
abre otra hoja con audiencia y guardado explícito. La galería abre una foto para
consultarla, elegir portada y gestionar el consentimiento del autor.

La comprobación funcional cubre invitación y aceptación desde otra cuenta,
acompañantes invitados, creación/edición/reordenación con IDs estables, presencia
y favorito independientes, vista previa local y subida de foto asociada a un
momento, portada, publicación única en feed y perfil. Marcar la raíz vivida no
marca la asistencia ajena; elegir audiencia de perfil no publica automáticamente.
La proyección anónima excluye identidad no consentida e invitados. Tras abandonar
el grupo, el autor mantiene su vista previa privada y puede retirar su propia foto.

## Navegación: regresión reproducida y corregida

El E2E adicional reprodujo un fallo real: entrar desde Concierto, cancelar y abrir
Espectáculo cambiaba la URL pero dejaba Concierto seleccionado. Next con Cache
Components conserva el estado del formulario dentro de Activity. La nueva captura
se identifica por `useRouter().bfcacheId` y la categoría inicial; una navegación
nueva reinicia el borrador, mientras atrás/adelante conserva la visita. La edición
mantiene su identidad y revisión vigentes.

Se conservó evidencia RED del navegador y se observó GREEN contra el build final.
El mismo recorrido también cambia manualmente a Museo y vuelve a entrar desde la
misma categoría para comprobar que no recupera la selección anterior. Los campos
opcionales plegados siguen enviándose al guardar una edición.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| Vitest completo, un worker | 429 archivos, 4248 pruebas, todas pasan tras la corrección final; 337,83 segundos |
| TypeScript | `npx tsc --noEmit`, exit 0 tras la corrección de navegación |
| Lint | 0 errores, 28 avisos previos; archivos finales de captura y E2E sin avisos |
| Producción | `npm run build`, exit 0; recorridos con `npm run start` en 3000 |
| E2E de Experiencias | 12/12 pasan en 2,7 minutos contra el build final, sin retries ni skips; focal de navegación 1/1 pasa |
| Contraste | 80/80 controles y guard de tokens pasan; galería y controles de álbum 12/12 |
| Arquitectura | Mapa sincronizado: 133 nodos, 252 aristas, 26 flujos y 213 pasos |
| Traducciones | 32 claves nuevas; 146 referencias estáticas en 22 archivos, sin faltantes ni nuevas claves huérfanas |

Los 25 unitarios añadidos cubren captura y payload de edición, momentos,
participantes, vista previa de subida y controles de álbum. Las doce pruebas E2E
conservan las siete familias de captura, participación, imágenes, social,
moderación, historial y retirada. Se ejecutan con un worker, sin retries, sobre
la compilación de producción; la prueba nueva cubre edición con opcionales
plegados. No se repitió el bootstrap ni las regresiones SQL del día anterior,
porque este delta solo cambia presentación y controles de UI.

Una revisión independiente final de captura, galería, publicación y participantes
no encontró regresiones accionables de estado, revisión o consentimiento.

## Navegador y evidencia visual

Chromium real, 16 vistas: hub, captura, recuerdo y perfil a 390 y 1440 px, en claro
y oscuro. Cero desbordamiento horizontal y un `h1` visible por vista. En móvil,
controles de texto/fecha/select a 16 px y objetivos de 44/48 px. Se comprobaron
teclado, Escape y retorno del foco en las hojas, con movimiento reducido activo.
No se observaron errores de página del apartado. El script de Speed Insights da
404 al usar `next start` fuera de Vercel; se registraron también peticiones RSC
canceladas al navegar/cerrar contextos. Esta verificación focal no constituye una
auditoría WCAG completa.

Capturas y registros seguros en el artefacto local
`experiencias-album-2026-10-03/`, junto a `qa-summary.json` y el script QA archivado.
`recuerdo-final-desktop.png` es una captura de la aplicación a 1440×900, tras cargar
imágenes y volver al inicio de la página. La foto de concierto es una escena
ficticia generada para la demostración, reutilizada del demo anterior; las personas
y recuerdos son datos QA. Las capturas no son contenido real de producción.

El script archivado requiere volver a su carpeta de trabajo
`.superpowers/experience-album-qa-2026-10-03/` para resolver los imports relativos;
los E2E comprometidos son la vía reproducible ordinaria.

## Repetir y limpiar

```powershell
npm run test -- --maxWorkers=1 --no-file-parallelism
npx tsc --noEmit
npm run lint
npm run build
npm run start
# En otra terminal, reutilizando el único servidor de 3000:
npx playwright test --config playwright.experiences.config.ts
node docs/architecture/sync.mjs --check
```

Los fixtures requieren `.env.local` de desarrollo; no imprimir credenciales ni
dirigirlos a producción. La cuenta QA persistente se conserva. Los actores
sintéticos se eliminan y comprueban con Auth 404 y ausencia de perfil. La
demostración manual retiró raíz, descendientes, publicación, notificaciones y
ambas rutas de Storage; cerró sus contextos y eliminó su carpeta de trabajo.

La evidencia de moderación se limpió con
`e2e/fixtures/experiences-moderation-cleanup.sql` en dev, acotando cada ejecución a
la raíz del manifiesto de esa tanda. Después se procesa la cola:

```powershell
node scripts/experiences/cleanup-pending-photos.mjs --project=dev --kind=deleted --hours=1 --execute
```

La limpieza retiró dos objetos sintéticos, sin reintentos. Consulta final de dev:
cero actores `qa_exp_`, raíces QA, evidencia QA, fotos en cola y objetos de Storage
de ambos manifiestos; los perfiles de sus actores también están ausentes. Los 23
actores de la tanda E2E final pasaron las aserciones de eliminación. Servidor
propio detenido y puerto 3000 libre; no se crearon worktrees.

El log unitario reveló una anidación HTML previa en `JointCard`, ajena al álbum:
`RatingDots` devuelve un `div` dentro de un `p`. Se confirmó en código y se abrió
[#1324](https://github.com/borjar20/Biblioshare/issues/1324), con reproducción y
riesgo potencial de hidratación; no se atribuye un fallo de producción ni se
mezcla su arreglo con este rediseño.

Merge, migraciones de producción y despliegue siguen pendientes de
[#1293](https://github.com/borjar20/Biblioshare/issues/1293). Los límites de dominio
registrados el día anterior siguen en sus issues; este rediseño no los cierra.
