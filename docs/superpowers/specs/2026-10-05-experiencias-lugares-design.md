# Experiencias — lugares reales autocompletados

> **[Histórico · congelado 2026-10-05 · diseño aprobado, pendiente de implementar]**
> El propietario aprobó el diseño por secciones en conversación. El estado aplicado
> por entorno vivirá en `docs/requirements/data-model.md`; este documento fija el alcance.

Base: [diseño de Experiencias v1](2026-10-02-experiencias-design.md), que dejó el lugar como
etiqueta manual y sin catálogo global (§ valores). Este documento añade ese catálogo sin
quitar la etiqueta.

## 1. Objetivo y alcance

Que el lugar de un momento sea **más fácil de rellenar** (autocompletado) y quede guardado
como **dato estructurado** para usos futuros (fichas de lugar, «este lugar tiene X
experiencias vividas»). El texto libre sigue valiendo: «Casa de mis padres» no es un lugar
que deba vincularse y se guarda como hoy.

Decisiones de producto tomadas:

1. **Se ofrecen sitios concretos y también ciudades/regiones/países** (un momento de viaje
   suele ser «Lisboa»). Nunca direcciones, calles ni edificios sin nombre.
2. **Al elegir una sugerencia se muestra siempre el nombre oficial**, como chip con ✕. No
   hay nombre editable vinculado: quitar el chip vuelve a texto libre.
3. **Proveedor: Photon (OpenStreetMap)** a través de un proxy propio; las sugerencias van
   **firmadas** por el servidor para que nadie pueda inventar lugares.
4. Las etiquetas existentes **no se migran** ni se vinculan solas.

Fuera de alcance: contador por lugar, fichas `/lugar/[id]`, mapa, «cerca de mí»,
instancia propia de Photon, reconciliación de ids de OSM que cambian.

## 2. Datos

### Tabla `public.places` (global)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` pk default `gen_random_uuid()` | |
| `provider` | `text not null` | CHECK `in ('osm')` |
| `provider_ref` | `text not null` | `osm_type` + `osm_id`, p. ej. `N240109189`; CHECK `^[NWR][0-9]+$` |
| `name` | `text not null` | 1–240 |
| `category` | `text not null` | `osm_key:osm_value`, p. ej. `tourism:museum` |
| `layer` | `text not null` | CHECK `in ('poi','city','region','country')` |
| `lat`, `lng` | `double precision not null` | rangos válidos por CHECK |
| `city`, `region`, `country` | `text` | opcionales |
| `country_code` | `text` | ISO-3166 alfa-2 en mayúsculas, opcional |
| `wikidata_qid` | `text` | `^Q[0-9]+$`, solo si Photon lo devuelve en `extra` |
| `created_at`, `updated_at` | `timestamptz not null default now()` | |

- `unique (provider, provider_ref)`.
- RLS activada; policy SELECT para `anon` y `authenticated` (dato público, sin datos de
  usuario). **Sin** INSERT/UPDATE/DELETE para clientes.
- No se borra desde la app.

### `experience_moments.place_id`

- `uuid null references public.places(id) on delete set null`, con índice.
- `place_label` se conserva. Cuando hay `place_id`, la RPC escribe en `place_label` el
  `places.name` (ignora el texto enviado). Así tarjeta, detalle y feed **no cambian su
  lectura**.
- Columna nueva: correr la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna).

### RPC

- `place_upsert(p_input jsonb) returns uuid` — SECURITY DEFINER, `search_path=''`,
  EXECUTE **solo `service_role`** (revocado de PUBLIC/anon/authenticated). Inserta o,
  ante conflicto `(provider, provider_ref)`, actualiza los datos y `updated_at`. Valida
  los mismos CHECK.
- `experience_create` y `experience_save_moment` aceptan en `p_input` las claves
  opcionales `placeId` (uuid) y `keepPlace` (boolean):
  - `placeId` presente → debe existir en `places` (si no, `22023`); fija `place_id` y
    `place_label = places.name`.
  - `keepPlace=true` (solo `save_moment` de un momento existente) → conserva `place_id`
    y `place_label` actuales.
  - Ninguno → `place_id = null`, `place_label` = texto enviado (comportamiento actual).
  - Las firmas SQL no cambian (siguen recibiendo `jsonb`), así que no hay sobrecargas.

## 3. Búsqueda: `GET /api/places/search?q=`

- Exige sesión (401 si no hay). `q` recortada, 3–100 caracteres; si no, `[]`.
- Llama a `https://photon.komoot.io/api/?q=…&limit=15` con timeout de 8 s (ajustado 2026-10-05 tras medir 4,9–6 s de latencia real de Photon, #1405), filtra y
  devuelve como mucho **6** resultados.
- La llamada a Photon vive en una función `use cache` con `q` normalizada como único
  argumento escalar. **Regla #437:** el dato es idéntico para anónimo, dueño y tercero (no
  toca Supabase ni sesión) → cacheable; la comprobación de sesión queda fuera, en la ruta.
- **Lista blanca** (función pura `classifyPhotonFeature`):
  - `poi`: `osm_key` en `amenity`, `tourism`, `leisure`, `historic`, `sport`, `natural`.
  - `city`: `place` = `city`, `town`, `village`, `hamlet`, `island`, `suburb`.
  - `region`: `place` = `state`, `province`, `region`, `county`; `boundary:administrative`
    con capa `state`/`county`.
  - `country`: `place:country` o capa `country`.
  - Descartados: sin `name`, `building`, `highway`, `place:house`, capas `house`/`street`.
- Respuesta: `{ items: { token, name, layer, category, subtitle }[] }`, donde `subtitle` es
  «ciudad, país» (o «región, país»).
- **Token**: HMAC-SHA256 con `PLACES_SIGNING_SECRET` (server-only, nuevo en `.env.example`)
  sobre el JSON canónico de los datos normalizados del lugar + `exp` (ahora + 1 h).
  Formato `base64url(payload).base64url(firma)`; verificación en tiempo constante.
- `MOCK_EXTERNAL_APIS=true` → resultados de datos de prueba, sin red.

## 4. Guardado (server actions)

`createExperience` y `saveMoment` aceptan además `placeToken?: string` y
`keepPlace?: boolean`:

1. Si llega `placeToken`: verificar firma y `exp`. Válido → cliente de servicio llama a
   `place_upsert` y se obtiene `placeId`. Inválido/caducado/error → se continúa **sin
   lugar**, guardando el texto como etiqueta. El guardado nunca falla por el lugar.
2. Se llama a la RPC con la sesión del usuario pasando `placeId` o `keepPlace`.

Por qué no una RPC `authenticated`: se podría llamar directamente contra Supabase y saltarse
la firma. El alta solo ocurre en servidor, con datos firmados.

`validation.ts` acepta las nuevas claves (`placeToken` string ≤ 2048, `keepPlace` boolean)
y sigue rechazando claves desconocidas.

## 5. Interfaz: `PlaceCombobox`

Nuevo en `src/components/experiences/`; sustituye al input de lugar en `experience-form.tsx`
y `moment-editor.tsx`.

- **Texto libre**: escribir sin elegir funciona como hoy (`placeLabel`).
- **Sugerencias**: espera 300 ms sin teclear, `AbortController` cancela la búsqueda anterior;
  lista de ≤ 6 con nombre y una línea "capa · subtítulo". Pie «© OpenStreetMap» (ODbL).
  Mientras la petición está en vuelo (campo con foco, ≥ 3 caracteres) se muestra bajo el
  campo una línea tenue «Buscando…» (`role="status"`, `aria-live="polite"`); desaparece al
  llegar resultados, fallar, bajar de 3 caracteres, salir del campo o elegir
  (ajustado 2026-10-05 tras medir 4,9–6 s de latencia real de Photon, #1405).
- **Elegida**: chip con nombre oficial + ✕; inputs ocultos `placeToken` y `placeLabel`.
  ✕ vuelve a input vacío con foco.
- **Edición de momento vinculado**: arranca en chip; si no se toca, envía `keepPlace`.
- **ARIA combobox**: `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`; ↑/↓ recorren, Enter elige, Esc cierra conservando el texto.
- Copys nuevos en `messages/*.json`.

## 6. Errores y límites

- Photon caído o > 8 s → sin lista y sin aviso; el texto libre sigue.
- Token inválido/caducado → se guarda como texto (§4).
- `place_id` con `on delete set null`; `places` no se borra desde la app.
- Sin migración de etiquetas antiguas.

## 7. Tests

- **Vitest**: `classifyPhotonFeature` con datos de prueba reales (museo, ciudad, región, país,
  calle, casa, sin nombre); firmar/verificar token (válido, caducado, manipulado, otro
  secreto); server actions (con token, sin token, token inválido, `keepPlace`); ruta de
  búsqueda (401 sin sesión, `q` corta, timeout); `PlaceCombobox` (teclado, chip, ✕, envío).
- **SQL** (`supabase/tests/`, con rollback): `authenticated` no ejecuta `place_upsert` ni
  inserta en `places`; `placeId` fija la etiqueta oficial; `placeId` inexistente → `22023`;
  `keepPlace` conserva; grants de la columna nueva.
- **e2e**: crear un momento eligiendo una sugerencia de prueba y ver el nombre en el
  detalle, contra build de producción (#437).

## 8. Documentación al cerrar

`data-model.md` (tabla, columna, RPC), `decisiones.md` (proveedor OSM/Photon y firma de
sugerencias), `backlog.md`, `.env.example`, y una issue `tipo:feature P3` para el
contador/fichas de lugar.
