# Verificación de contratos de combate

> **[Canónico · verificado 2026-09-07 · CLI: run, calibrate, replay, golden, fork, freeze]**

Usar Node 22 e instalar el lockfile con `npm ci`. Los comandos `fork` y `freeze` automatizan el ritual de publicar versiones (#1093).

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

Para el gate de integración se necesita un Supabase **local** nuevo con el esquema
de la app y `supabase/migrations/20260907_pet_battles.sql` aplicada. Ejecutar también
`supabase/tests/pet_battles_permissions.sql` con `psql -v ON_ERROR_STOP=1`.

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
3000 libre: reutilizar un `next dev` no verifica el build. Playwright ejecuta tres
tests, sin reintentos: permisos/aislamiento con dos cuentas, replay persistido y
login renderizado e hidratado en Chromium. Las cuentas creadas se eliminan por REST,
incluido un fallo a mitad de la preparación. No se usa la cuenta persistente de QA.

## Límite del bootstrap del repositorio

En la verificación del 2026-09-06, ni `supabase/migrations/` por sí sola ni el
`schema-baseline.sql` original arrancaron desde vacío. La carpeta carece del esquema
inicial y el baseline omite prerrequisitos e incluye datos de sagas de producción.
El E2E pasó con un bootstrap temporal adaptado. Eso verifica `pet_battles` sobre una
base nueva, pero **no convierte en PASS el replay del historial original**. Mantener
ese gate pendiente hasta disponer de un bootstrap canónico reproducible; no copiar
datos productivos ni saltar errores SQL para convertirlo en verde.
