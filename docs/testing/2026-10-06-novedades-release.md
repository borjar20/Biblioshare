# Novedades — entrega

> [En curso · 2026-10-06. Publicación y producción autorizadas por «Enga dale». Las correcciones R1 están implementadas y verificadas en local/dev; falta publicarlas en la rama, obtener CI verde y completar la revisión independiente de los fixes. Producción sigue intacta.]

Seguimiento: [#1423](https://github.com/borjar20/Biblioshare/issues/1423).
Revisión del cambio: [PR #1424](https://github.com/borjar20/Biblioshare/pull/1424).
Base `bd98ec117567a45436cce4a6c18987d00814ddf7`; primer candidato
`80d09b51bef91d725b661f688fabb2c689fadfc5`. Las pruebas de implementación y sus
límites se conservan en [el informe anterior](2026-10-06-novedades.md).

La aprobación del ticket no autorizó por sí misma publicar código ni producción.
La petición posterior de continuar inicia esta entrega; mantiene CI del HEAD final,
revisión independiente y verificación del destino como condiciones antes del cierre.
Los dos revisores y el responsable SQL utilizan GPT-6.1 Sol con esfuerzo max y
contexto nuevo. Los informes R1 permanecen separados de las correcciones posteriores.

## Standards

R1: FAIL de cumplimiento estricto; cero bloqueos materiales de seguridad/sesión/caché.
Se repiten invalidaciones públicas mediante `revalidatePath` en las acciones aunque
existen helpers de dominio, contra `docs/reactividad.md`. También queda un sello
«navegador pendiente» en UI-GUIA, contradicho por el pase R3.

La heurística opcional Data Clumps sobre los dos tokens de edición es una valoración
de mantenimiento, no un requisito de entrega ni un fallo de concurrencia. Se conserva
el contrato de esos tokens separados. El patrón `search_path=''` con objetos
cualificados está exceptuado explícitamente en decisiones; no se presenta como una
vulnerabilidad descubierta.

Informe conservado: `.scratch/novedades/release-standards-r1.md`.

## Spec

R1: FAIL por un P1 de datos y un P2 de interfaz. Publicar una primera traducción sin
identidad de libro reutiliza el año de su edición como `books.published_year`, que
la ficha etiqueta Primera publicación. Cuando solo se conoce el lanzamiento de la
traducción, el año original debe permanecer desconocido. La corrección conservará
el comportamiento de libros nuevos y no modificará migraciones ya aplicadas a dev.

El formulario permite cambiar modalidad/mercado de anuncios existentes mientras
el trigger protege su identidad incluso en borradores. Se corregirá la edición
para reflejar la inmutabilidad y conservar los valores del formulario enviado.

Informe conservado: `.scratch/novedades/release-spec-r1.md`.

Resumen R1: Standards, dos incumplimientos documentados y una heurística opcional,
sin bloqueos materiales; Spec, dos hallazgos, el más grave es el año original P1.
Ningún dato de Novedades se ha publicado en producción antes de corregirlo.

## Correcciones del R1

- **Año original P1:** añadida la migración hacia delante
  `20261006134245_cultural_release_translation_publication_year.sql`. Una traducción
  no vinculada ya no inventa año de primera publicación; una traducción ligada conserva
  el año conocido; una obra nueva de modalidad `book` mantiene su ruta original. No se
  reescribieron las cuatro migraciones que ya estaban aplicadas en dev. La prueba SQL
  en dev cubre día/mes/año, borrador que se publica y controles de obra y año enlazados.
- **Identidad P2:** el formulario solo deja cambiar modalidad y mercado al crear el
  anuncio. Al editar conserva ambos en la solicitud, sin impedir correcciones de
  título, fecha o fuente. Las dos combinaciones permitidas del trigger se cubren con
  regresiones focales. El antiguo caso RED queda en
  `.scratch/novedades/release-ui-identity-red-r1.log`.
- **Revalidación:** las acciones reutilizan el helper común y mantienen las mismas
  rutas invalidadas una vez por petición. El editor concreto usa el helper de su ruta;
  errores y sesiones caducadas no invalidan. El RED queda en
  `.scratch/novedades/revalidation-red-r1.log`.
- **Instalación limpia:** se regeneró el baseline SQL desde el manifiesto de cinco
  migraciones. El contrato local/CI de bootstrap, el guard y el caller real ahora pasa
  37/37. El antiguo enlace del harness también mostraba las dos razones esperadas:
  import de releases no instrumentado y baseline aún con cuatro migraciones. RED de CI:
  `.scratch/novedades/ci-initial-bootstrap-fail-r1.log`.

En biblioshare-dev, las cinco migraciones ya están aplicadas. Tras la quinta,
`cultural_releases.sql` pasa el contrato de roles reales, privacidad, concurrencia,
avisos, fecha editorial, año original, y rollback: el censo final arroja cero
filas en lanzamientos, suscripciones y entregas. El chequeo de metadatos también
pasa: cuatro tablas con RLS y grants por columna, siete políticas, catorce firmas,
ACL y `search_path`; el trabajo programado sigue inactivo. El análisis de seguridad
dev devuelve 138 identidades, coincidentes con la línea base de producción (cero
añadidas y cero retiradas). La evidencia de este corte está en `.scratch/novedades/` como
`dev-contract-after-translation-year-r2.json`,
`dev-metadata-after-translation-year-r2.json` y
`dev-advisors-after-translation-year-r2.json`; la comparación está en
`advisor-comparison-r2.txt`.

## Verificación local de los fixes

- Vitest focal: 107/107 PASS en seis archivos; incluye actions, revalidación,
  mutaciones editoriales, formulario y sus datos enviados.
- Contratos locales de bootstrap y guard: 37/37 PASS.
- TypeScript completo (`--noEmit --incremental false`) y ESLint sobre los ocho
  archivos cambiados: PASS, sin diagnósticos.
- La revisión de navegador R3 del candidato inicial fue 6/6; el formulario corregido
  añade pruebas DOM/FormData. Esta observación no reemplaza la CI del candidato final.

**La CI que falló pertenece al candidato inicial `80d09b5`; no certifica estas
correcciones.** Hay que incorporar las correcciones en un candidato nuevo y exigir
todos sus checks terminados en verde. La revisión y preflight R1 registraron los
problemas originales; no los reescriben ni se presentan como revisión independiente
de los fixes.

## Estado de entrega

- [x] Rama y primer candidato publicados; PR creada y adjunta al chat.
- [x] Corregir y verificar los hallazgos en local y desarrollo.
- [ ] Revisión independiente de los fixes por alguien que no los haya escrito.
- [ ] Completar CI del HEAD final y contrastar la base antes de fusionar.
- [ ] Aplicar y verificar en producción el esquema final ya comprobado en dev.
- [ ] Verificar despliegue real, endpoint protegido y sincronización real antes de activar el job.
- [ ] Actualizar documentos canónicos y el ticket con los resultados y límites finales.

El conector Vercel disponible corresponde a otro scope y devuelve 403 para
`borjar20s-projects`; el CLI no está instalado. Esto limita sus metadatos y logs;
no demuestra que falte el despliegue. La primera CI de la rama también confirmó un
preview Vercel `Ready`. GitHub publica el check de Vercel y el preview para
contrastarlos, además del sitio público real. No se cambian credenciales ni la
configuración de Vercel para resolver este acceso.
