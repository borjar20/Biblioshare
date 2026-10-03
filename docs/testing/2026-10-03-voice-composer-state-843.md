# Transiciones del composer de voz — #843

> **[Informe de verificación · 2026-10-03]** Cobertura local sobre la base `4a63cf92a0e54e732afbbb2ecd4d0b82453e5ccb`. Producto intacto. No acredita integración con main, CI, micrófono físico ni ejecución nativa de Next.

## Resultado y contrato

**PASS_CANDIDATE**: 16 casos nuevos (7 `PostThread`, 9 `ReviewInteractions`) y **50/50 pruebas focales en seis ficheros**. Tipos y lint focal PASS con Node 24 explícito. Dos controles sobre copias exactas pasan los 16 casos; retirar individualmente cada una de las ocho garantías solicitadas provoca **ocho FAIL de aserción causales**, conservados.

La [issue #843](https://github.com/borjar20/Biblioshare/issues/843) pide fijar el comportamiento actual: cambiar el objetivo o editar desarma la voz; cancelar la respuesta la cierra y desarma; publicar voz cierra el contexto de respuesta antes de resolver el envío. Se ejercen controles DOM de los componentes reales. Ningún test lee `voiceMode`, invoca handlers privados ni construye un espejo del estado. No se modifica el producto ni se reproduce un bug de la base actual.

La deuda de avisar antes de cortar una grabación al cambiar de objetivo queda fuera de este cambio. Los tests esperan la transición directa actual; si se incorpora ese aviso habrá que adaptar estas expectativas a la decisión de producto.

## Cobertura observable

| Recorrido | PostThread | ReviewInteractions | Oráculo |
|---|---|---|---|
| Voz raíz → Responder | Sí | Sí | Grabadora ausente, respuesta de texto con mención correcta, una sola petición de micrófono y pista anterior detenida. |
| Voz de respuesta → otro objetivo → objetivo anterior | Sí | Sí | No reaparece la grabadora al volver; el micrófono no se solicita por cambiar el objetivo. |
| Responder de nuevo a la misma raíz | Sí | Sí | Desarma incluso cuando el objetivo conserva identidad. |
| Responder a otro comentario de la misma raíz | Cubierto por composer único/cambio de objetivo | Caso dedicado | Cambia la mención y conserva texto, sin volver a pedir audio. |
| Entrar a editar y cancelar la edición | Desde respuesta | Desde raíz y respuesta | Edición real con cuerpo correcto, grabadora desarmada y regreso a texto. |
| Cancelar respuesta con voz activa | Botón de cabecera visible durante grabación | Respuesta de texto abierta + voz raíz activa | Cancelar respuesta desarma la grabadora sin un nuevo gesto de micrófono. |
| Descartar grabación → cancelar respuesta | Sí | Sí | Descartar devuelve a texto en la misma respuesta; cancelarla vuelve a raíz. En Review, rearmar exige un nuevo clic explícito. |
| Preview → publicar respuesta de voz con envío retenido | Sí | Sí | Archivo/FormData real del hook, parentId correcto, fila pendiente y respuesta cerrada antes del resultado; al resolver desaparece la fila pendiente. |

`ReviewInteractions` presenta simultáneamente un composer raíz y el de respuesta. Mientras graba en la respuesta, su botón de cancelar texto no está montado. El recorrido respuesta de texto + voz raíz permite verificar la guarda de cancelación mediante una secuencia pública válida, sin exponer estado ni retirar una segunda protección.

## Fronteras y archivos propios

- `src/components/social/post-thread.voice-mode.test.tsx` y `review-interactions.voice-mode.test.tsx`: componentes reales, menús reales de edición, `CommentComposer`, hooks y controles de grabación reales.
- `src/components/social/voice-mode.test-fixture.tsx`: comentarios tipados, proveedor `NextIntlClientProvider` con mensajes reales y fakes compartidos de las APIs de navegador. Sólo sustituye `getUserMedia`, `MediaRecorder`, `AudioContext`, URL de Blob, `ResizeObserver`, `usePathname` y transportes de acciones/consulta de menciones. No sustituye `VoiceRecorder`, `VoiceRecorderEngine`, `useVoiceNoteSubmit`, `useOptimisticAction`, reducers ni UI.
- Este informe. Son cuatro archivos nuevos; no cambia el runner, las dependencias ni canónicos compartidos.

El motor real acumula duración y picos con sus ticks de 100 ms. El reloj local se avanza 2.100 ms para habilitar publicar y el fake de `MediaRecorder` emite `dataavailable`/`stop` con bytes sintéticos. Se inspeccionan el `FormData`, su archivo no vacío y destino; no se afirma que esos bytes sean audio reproducible. La promesa local que representa el envío permanece pendiente durante la comprobación del cierre del contexto y se resuelve después. No hay peticiones a DB, Storage ni proveedores reales.

No se ejercen reproducción, permisos del navegador, revocación nativa, límite de 60 s, SSR/hidratación, corte largo con confirmación, navegación de Next o revalidación remota. Los casos no convierten esas fronteras en PASS nativo.

## Gates y FAIL conservados

Evidencia pública en la raíz del repositorio: `.scratch/ticket-campaign/20261002-resolve-all/voice843-implementation-20261003/`.

| Gate | Resultado | Evidencia |
|---|---|---|
| Primera ejecución de configuración | Error de arnés antes de tests | `baseline-01.log`: import absoluto de subpath de Vitest; corregido a su import público. No demuestra fallo de producto. |
| Primer import del fixture | Error de arnés, cero tests | `baseline-02.result.json`: Vitest no exporta directamente una variable hoisted; se exporta una referencia posterior. |
| Primera ejecución de los 16 casos | 14 PASS / 2 FAIL de expectativa del test | `baseline-03.result.json`: se esperaba 64 picos; el contrato real conserva menos barras para grabaciones cortas. Corregida esa expectativa a 1–64, sin tocar producto. |
| Desarrollo y caso final de cancelación | 16/16 PASS | `baseline-04.result.json`, `baseline-05.result.json`. |
| Focal final | 50/50 PASS en 6 ficheros | `focal-01.result.json`, configuración e invocación exactas. Incluye submit/retry, límites, picos y reducer optimista existentes. |
| Tipos | PASS | `types-02.log`/invocación. `types-01.log` conserva el error previo propio por usar una opción `exact` que `ByRoleOptions` no acepta; se retiró, conservando comparación exacta por nombre de cadena. |
| Lint focal | PASS | `lint-02.log`/invocación. |
| Copias de control | 7/7 y 9/9 PASS | `mutants/post-control/`, `mutants/review-control/`. |
| Ocho mutantes | Ocho FAIL esperados, cero errores de ejecución de suite | `mutation-verdicts-01.json`, `mutations.json`; cada carpeta conserva copia de componente, test exacto, config, log, JSON e invocación. |
| Integridad y whitespace | PASS | Manifiestos de fuentes antes/después y recibo de Git. |

| Mutante: única garantía retirada | Caso que falla | Fallo observado |
|---|---|---|
| `post-reply`: desarmar en startReply | Voz raíz → respuesta | Sigue montada una grabadora. |
| `post-edit`: desarmar en startEdit | Voz respuesta → edición | Sigue montada una grabadora. |
| `post-cancel`: desarmar al cancelar respuesta | Cancelar con voz activa | Sigue montada una grabadora. |
| `post-publish`: cerrar replyingTo en publicar voz | Publicar antes del resultado del envío | Sigue el textarea de respuesta. |
| `review-reply`: desarmar en startReply | Responder de nuevo a la misma raíz | Sigue montada una grabadora. |
| `review-edit`: desarmar en startEdit | Voz raíz → edición | Sigue montada una grabadora. |
| `review-cancel`: desarmar al cancelar respuesta | Respuesta de texto + voz raíz | Sigue montada una grabadora. |
| `review-publish`: cerrar replyingTo en publicar voz | Publicar antes del resultado del envío | Sigue el textarea de respuesta. |

Las copias sólo normalizan CRLF y retiran una actualización de estado. Un resolver de prueba conserva las dependencias reales del worktree; los controles pasan por el mismo resolver. Los tests copiados son idénticos por bytes. Las fuentes originales no se editan para producir RED.

## Integridad y pendiente de integración

Se comparan 20 fuentes existentes antes/después, incluidos los siete archivos publicados de #901, ambos consumidores de voz, Recorder/Engine y hooks. Todos conservan sus hashes. No se crea worktree ni se cambia base, main, esquema, configuración o secretos.

El trabajo permanece sobre la rama preparada `codex/voice-composer-coverage-843`. Main avanzó a `a0b0e03` durante la ejecución; el coordinador integrará después ese estado. El typecheck aquí sólo acredita la base `4a63cf92`; queda pendiente el gate de integración sobre el HEAD combinado y la CI de publicación. No se cierran issues desde este trabajo.
