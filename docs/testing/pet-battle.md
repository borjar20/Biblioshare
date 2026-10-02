# Verificación de contratos de combate

> **[Canónico · CLI verificado 2026-09-07; bootstrap vacío y gate de integración local verificados el 2026-10-02 (#1092/#1299)]**

Usar un Node LTS admitido por `package.json` e instalar el lockfile con `npm ci`.
La tanda local del 2026-10-02 usa Node 24.19.0. Los comandos `fork` y `freeze`
automatizan el ritual de publicar versiones (#1093).

```powershell
npm run test:pet:battle
npm run --silent pet:battle -- run --json > battle.json
npm run --silent pet:battle -- replay battle.json
npm run --silent pet:battle -- calibrate --seeds 200
```

El primer comando ejecuta las pruebas del motor y las regresiones de exportación
del CLI y limpieza de cuentas. `--json` tiene prioridad sobre `--events`; stdout
contiene un único documento JSON. El replay selecciona una versión conservada,
no el motor actual. Ver `src/lib/pet/battle/versions/README.md`.

## Regresiones de cliente y permisos de aventuras (PR #1127)

```powershell
npx vitest run src/components/pet/training src/components/pet/adventure --maxWorkers=1 --no-file-parallelism
```

La sesión comprueba que la repetición reinicia la recarga de la ulti al comenzar
y al cambiar de tramo, conservando r2.2 sin ulti y los tiempos de r3.1. El panel
comprueba que una denegación del getter de `localStorage` permite empezar una
aventura sin persistencia local.

En `mascota-batallas-autoridad.spec.ts`, las dos RPC de escritura se prueban con
todos sus argumentos obligatorios. Con JWT de usuario deben responder `403`,
código PostgreSQL `42501` y denegación de permiso sobre la función correspondiente.
Un `404` por firma inexistente o un error de autenticación no demuestra este
contrato y debe fallar el test. Ver [errores de PostgREST](https://docs.postgrest.org/en/stable/references/errors.html).

Verificación de estas correcciones el 2026-09-07: los dos fallos nuevos se
reprodujeron antes del arreglo; después pasan los 44 tests de los seis archivos
de entrenamiento y aventuras, el typecheck y el lint de los archivos tocados.
La prueba HTTP de permisos necesita un entorno Supabase disponible; este
resultado unitario no acredita los permisos de dev ni de producción.

## Gate de integración local

Preparar un Supabase **local** nuevo mediante el bootstrap canónico de
[supabase-local.md](supabase-local.md). El plan incluye la migración de batallas;
no aplicar las migraciones sueltas sobre una base vacía ni volver a aplicarla
después. Ejecutar también `supabase/tests/pet_battles_permissions.sql` con
`psql -v ON_ERROR_STOP=1`.

Cargar únicamente las claves del proyecto local en el proceso que compila y prueba:

```powershell
$localStatus = supabase status --output json | ConvertFrom-Json
$env:NEXT_PUBLIC_SUPABASE_URL = $localStatus.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localStatus.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3000'
npm run build
npm run test:e2e:pet:local
```

El config dedicado rechaza hosts no locales y no carga `.env.local`, semillas
compartidas ni el barrido de cuentas de dev. Arranca `next start` y exige el puerto
3000 libre: reutilizar un `next dev` no verifica el build. Playwright ejecuta cuatro
tests, sin reintentos: permisos/aislamiento con dos cuentas, replay persistido,
exclusión concurrente de aventuras y login renderizado e hidratado en Chromium.
Las cuentas creadas se eliminan por REST,
incluido un fallo a mitad de la preparación. No se usa la cuenta persistente de QA.

## Fallo histórico y verificación del bootstrap

En la verificación del 2026-09-06, ni `supabase/migrations/` por sí sola ni el
`schema-baseline.sql` original arrancaron desde vacío. La carpeta carece del esquema
inicial y el baseline omite prerrequisitos e incluye datos de sagas de producción.
El E2E pasó con un bootstrap temporal adaptado. Eso verifica `pet_battles` sobre una
base nueva, pero **no convierte en PASS el replay del historial original**. Esta
limitación describe aquella tanda y conserva su fallo; no se reclasifica.

El 2026-10-02 el bootstrap canónico se ejecutó desde vacío: **273 pasos, 18
contratos SQL y cuatro familias de concurrencia PASS**, sin copiar datos de
producción ni omitir errores. #1299 repara el valor `mentioned` que faltaba en
la reconstrucción; los objetos reales de dev/prod ya lo contienen y no
necesitaron DDL remoto. La preparación usa un destino local nuevo y conserva
el backup anterior. Evidencia: [notification-type-bootstrap-1299.md](2026-10-02-notification-type-bootstrap-1299.md).

Sobre esa base se ejecutaron los **cuatro casos dedicados de combate PASS**,
junto a doce casos de reloj, contra un build/start de producción nuevo. Los
permisos SQL pasan antes y después. Las 27 peticiones HTTP nativas incluyen
siete denegaciones autenticadas, cuatro anónimas y el duplicado esperado
`409/23505`; no hubo errores de transporte. Se auditaron cuatro actores:
Auth 404, cierre global de sesión y cero filas propias, cuotas, sesiones o
refresh tokens. Next y la DB quedaron detenidos, esta última con backup, y
el puerto 3000 libre. Esta evidencia verifica el gate local de #1092, sin
afirmar nuevos resultados en dev o producción.

Evidencia conservada en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/integration-1790938830828/`:

- Build `GHPTlpI0jcGGEc3YV72WJ`; manifiesto Next
  `6e3c8481152f22b494e9a67a24e250450ee6554c883a48753daf866af9b85e39`.
- Resultado de los 16 casos: cero SKIP, flaky o reintentos, 14,769 s. Los
  cuatro de combate y los doce de reloj conservan alcances separados.
- SHA256 de `result.json`:
  `cc4cb9d0ac8850c58c1f1cc24950b4c3d65123fd4d432efbc0bb0e7ed53793f4`.
- SHA256 de `manifest.sha256.json`:
  `7c6062c4ab81f83e132b8c03703d3284a55fc372462d6506f5043e6c85b96396`;
  49 artefactos y 209 fuentes estables, cero discrepancias o secretos.

El primer build del worktree falló porque su junction de `node_modules`
salía de la raíz de Turbopack. No ejecutó casos ni creó actores. Se conserva
su FAIL con 34 artefactos; la recuperación ajustó sólo la raíz de filesystem
mediante el runtime QA, sin cambiar el producto ni su configuración fuente.
