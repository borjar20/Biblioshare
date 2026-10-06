# Novedades — contrato de implementación

> [Contrato de implementación · 2026-10-06. Implementado y verificado en código, base local y biblioshare-dev, incluidos seis recorridos y revisión independiente de navegador R3 PASS. Aislamiento, migraciones local/dev y subagentes autorizados; entrega a usuarios pendiente.]

Fuente de producto: `2026-10-06-novedades.md`, con trece acuerdos. El trabajo solicitado es construir la primera versión completa, no ampliar el alcance editorial ni incluir episodios semanales, reediciones o propuestas de usuarios.

## Contrato de producto implementado

- `/novedades` permite a visitantes explorar películas, series, temporadas y libros anunciados. España y castellano son la referencia; las fechas internacionales se identifican.
- «Lo que esperas» requiere sesión y deriva de `passes` y del seguimiento de sagas. No añade seguimiento de autores ni otra watchlist.
- Una obra agrupa sus lanzamientos, con cine y digital separados. Las fechas parciales y desconocidas conservan su precisión; el proveedor digital no se deduce de una fecha.
- Añadir a Pendiente registra la obra mediante las acciones del dominio actual y no activa avisos. «Avisarme» se elige por lanzamiento y puede retirarse independientemente.
- Administración introduce, revisa, publica, corrige y cancela anuncios de libros. Publicar conserva su biblioteca personal. Las obras sin ISBN se admiten; su asociación posterior a un proveedor exige revisión explícita.
- Una revisión automática diaria consulta TMDB. Los libros se revisan semanalmente mediante el panel editorial; se muestra la fecha de la última revisión efectiva.
- Los avisos expresamente elegidos se emiten el día anterior al día exacto del lanzamiento, o ante confirmación, cambio efectivo o cancelación. No se emiten recordatorios con un día inventado. Se reutilizan la campana y el transporte push, respetando sus preferencias de canal.

## Contrato de datos autorizado para local/dev

El bloque siguiente conserva el contrato utilizado para implementar. El esquema final,
incluida `release_sync_state`, sus firmas, permisos y aplicación local/dev, está en
`docs/requirements/data-model.md` §8quinquies. No acredita aplicación en producción.

Crear tablas propias, sin alterar el estado de lectura o visionado existente:

1. `cultural_releases`: identidad del lanzamiento y de la obra, vínculo opcional con catálogo, título y portada públicos, modalidad, temporada/edición cuando corresponda, mercado, idioma, precisión de fecha, fuente, estado editorial, revisión y última comprobación. Solo los anuncios publicados son públicos. Administración puede revisar; el sincronizador actualiza exclusivamente entradas de TMDB.
2. `release_subscriptions`: elección de avisos por persona y lanzamiento. La consulta y escritura de cada persona se limita a sus propias elecciones. Ningún dato de suscripción entra en caché compartida.
3. `release_deliveries`: cola de avisos y claves de deduplicación por persona, lanzamiento, revisión y motivo. Solo el trabajo del servidor puede reclamar y confirmar entregas. Los reintentos conservan la distinción entre notificación aceptada y push entregado; no prometen entrega exactamente una vez a un dispositivo.
4. Estado de sincronización de las fuentes, para registrar la última revisión satisfactoria y distinguir una consulta fallida de un calendario sin resultados. La especificación técnica podrá integrar este estado con los registros de revisión si evita una tabla redundante.

Extender los tipos de notificación y la resolución de enlaces para recordatorios, cambios y cancelaciones de lanzamientos. Añadir grants mínimos, RLS y funciones necesarias en una migración versionada y reproducible. Las funciones de sincronización y reclamo quedan cerradas a `anon` y `authenticated`.

La periodicidad usará un endpoint POST protegido por el secreto de cron existente y el patrón pg_cron/pg_net del proyecto. No se crearán secretos ni se modificarán variables o configuración de producción en esta fase.

## Orden de trabajo y propiedad

1. Aislar el trabajo desde `origin/main` conservando el checkout y los cambios preexistentes; trasladar únicamente los documentos de diseño de esta sesión.
2. Implementar el contrato de datos, validación de fechas, adaptación de TMDB y SQL de permisos/cola. Verificar lectura pública, administración y aislamiento entre dos cuentas.
3. Implementar consultas y acciones personales, panel editorial, calendario y accesos desde Buscar/Inicio. No usar valores aportados por el navegador como fuente canónica para altas.
4. Integrar sincronización y avisos con claves estables, cambios efectivos y retirada del consentimiento. Cubrir fallos del proveedor y reintentos del trabajo programado.
5. Revisar cada parte con contexto independiente; corregir los hallazgos y verificar el conjunto en build de producción, base local y dev autorizada.
6. Sincronizar documentación canónica y dejar un cambio revisable. La publicación remota y producción mantienen su propia autorización.

## Verificación necesaria

- Unitarios de fechas parciales, región/modalidad, normalización de fuentes, identidad, cambios efectivos y deduplicación.
- SQL real: público solo ve publicados, usuario normal no publica, administrador no modifica pases al publicar, dos cuentas no comparten suscripciones, funciones de cron inaccesibles a clientes.
- Acciones: autenticación, resolución canónica del lanzamiento, alta a Pendiente idempotente y elección de aviso independiente.
- Cron: autorización cerrada, fallos visibles sin sustituir datos por vacío, concurrencia y repetición sin duplicar notificaciones, comprobación del consentimiento vigente.
- Navegador sobre build de producción: Explorar público; selección personal; cine/digital; anuncios sin día; publicación de libro sin ISBN; Pendiente y Avisarme por separado; cancelación y retirada de aviso.
- Tipos, lint, build, grant por columna y baseline de migraciones. Mantener los límites de cada comprobación y limpiar únicamente servicios y datos de prueba propios.

## Autorización concedida y frontera de entrega

`AGENTS.md` exige autorización específica para crear rama/worktree, desplegar subagentes y tocar migraciones. La petición de implementar autoriza el código y las pruebas pertinentes; la preparación presenta estos actos adicionales de forma concreta:

- Rama `codex/novedades` y worktree `.claude/worktrees/novedades`, desde la versión actual de `origin/main`.
- Migración local del esquema anterior, reproducción en base desechable y aplicación/verificación en `biblioshare-dev`. Sin aplicar a producción.
- Coordinación en el chat actual, implementación, pruebas y revisión independiente por GPT-6.1 Sol con effort max, según la corrección explícita del usuario. Sustituye los perfiles propuestos antes de comenzar el código.

No se autoriza en este documento commit, push, PR, merge, despliegue ni datos productivos.

## Estado de la implementación

Implementación local/dev realizada el 2026-10-06: código, esquema reproducible desde
base vacía, permisos, concurrencia, tipos y lint verificados. Navegador R3 completó
seis E2E contra build/start local a 390/1280 px, sin reintentos, con revisión independiente
PASS funcional y visual. Se conserva el límite de respuestas de red canceladas o
incompletas y errores de cierre de stream sin atribuirles una causa comprobada.
Implementación y revisiones realizadas con GPT-6.1 Sol,
effort max. El [informe de verificación](../testing/2026-10-06-novedades.md) conserva
los cortes FAIL, los checks PASS y sus límites, además de la revisión visual final.

Las cuatro migraciones están aplicadas en biblioshare-dev y el job `cultural-releases`
permanece inactivo. Faltan publicación e integración del código, aplicación y
verificación en producción y activación del scheduler después de comprobar su destino.
Esas acciones mantienen su autorización independiente y se rastrean en
[#1423](https://github.com/borjar20/Biblioshare/issues/1423), creado con aprobación
específica para el ticket, sin extenderla a publicación del código ni producción.
