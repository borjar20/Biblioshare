# S3 — Verificación de madriguera del club

> 2026-09-07 · implementación local y biblioshare-dev. Aceptación visual del usuario y producción pendientes.

Spec #1129; entregas #1130, #1131 y #1132. Base de revisión acordada: `1aa08ece4cf6e84d1ddfa1de56af4a41dd4affca`, rama actual `codex/pet-social-s2`.

## Resultado

- Lectura con membresía activa y privacidad de perfil, escena en feed, doce plazas iniciales, expansión a sesenta vecinas, contracción, tarjeta y enlace al dueño.
- Reintento mediante nueva lectura; invalidación tras seguimiento, bloqueo y privacidad. La membresía ya invalida el club. Sin tiempo real.
- Migración `20260907150832_club_burrow.sql` aplicada solo en `biblioshare-dev`. Wrapper invocador y helper privado definidor; ambos con search_path vacío, sin EXECUTE anónimo y con EXECUTE authenticated. Columnas mínimas; sin cambiar políticas de tablas.

## Evidencia ejecutada

Node 22.23.1. Comandos desde la raíz del repositorio, con ese runtime primero en PATH:

| Comprobación | Resultado |
|---|---|
| Primera prueba REST S3 antes de migración | FAIL esperado: RPC 404; fixtures limpiadas |
| Pruebas de interfaz antes de cada entrega | FAIL esperado: falta presentación de club; falta contracción; falta componente de reintento |
| `playwright test --config playwright.s3.config.ts`, modo API | PASS: 2 pruebas de acceso/privacidad con sesiones reales sintéticas |
| Recorrido móvil y club grande contra `next start` | PASS: 2 pruebas; bellota ajena, sin propia, perfil, salida propia, 65 vecinas visibles más una privada oculta, propia, expansión 61/60 y contracción |
| Suite completa `vitest run --maxWorkers=2` | PASS: 329 ficheros, 3349 pruebas; 70,08 s |
| Tras extraer decodificador compartido: S1 y escena club | PASS: 15 pruebas focalizadas |
| Decodificador S3: apariencia mínima, datos inválidos, acceso denegado y transporte | PASS: 9 pruebas adicionales |
| `tsc --noEmit` | PASS |
| `next build` (Turbopack por defecto) | PASS |
| ESLint de archivos modificados | Sin errores; aviso preexistente de variable `supabase` sin usar en página del club |
| `node --test scripts/db/bootstrap.test.mjs` | PASS: 7 pruebas; manifiesto y baseline actualizados |
| SQL de objetos y ACL en dev | PASS: firmas, privilegios y search_path conforme al contrato |
| Limpieza comprobada en dev | Cero cuentas y cero clubes del prefijo sintético S3 |

Las pruebas reutilizan la frontera E2E y la lectura autorizada acordadas. Los tests de componentes complementan estados de fallo y foco sin depender del transporte real. No se ejecutó un bootstrap completo de base local: Docker no estaba arrancado; la migración se verificó en el entorno de desarrollo autorizado.

## Fallos encontrados y resueltos

- El provider del club no incluía los mensajes de mascota: el primer E2E mostró `MISSING_MESSAGE: pet`. Se acotó un provider de mensajes al bloque S3; la repetición del recorrido pasó.
- El generador del club grande iniciaba sesión en todas las cuentas sintéticas y alcanzó el límite de Auth. Las cuentas que solo aportan mascotas ya no inician sesión; los lotes esperan todas sus escrituras antes de limpiar.
- El cierre automático del servidor por Playwright quedó detenido en Windows tras terminar las pruebas. Se identificó y terminó únicamente el proceso `next start` creado por esta ejecución; el comando del servidor de la configuración S3 se simplificó para evitar la cadena de npm.

## Límites y seguimiento

- Persisten avisos `HANGING_PROMISE_REJECTION` de Auth durante prerender, también en rutas ajenas al bloque. Seguimiento existente: #1098 y #1126; no se atribuye a S3 ni se afirma resuelta su causa.
- Capturas móvil/escritorio revisadas por el agente; no sustituyen la aceptación visual de José Ángel.
- No se publicó la aplicación, no se aplicó la migración en producción y no se cerraron las issues.
