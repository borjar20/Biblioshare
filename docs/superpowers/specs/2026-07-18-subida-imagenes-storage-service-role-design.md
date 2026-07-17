# Subida de imágenes: arreglo de Storage (service-role) + compresión de portadas

Fecha: 2026-07-18

## Problema

Subir imágenes falla en las tres superficies —avatar de perfil, portada de club y
portada de ficha— con un mensaje de error rojo. En producción el endpoint de
Supabase Storage responde **HTTP 400** en cada intento.

### Causa raíz (diagnosticada con reproducción)

El proyecto usa las nuevas *asymmetric JWT signing keys* de Supabase: los tokens de
sesión se firman con **ES256** (cabecera con `kid`) y el anon key es el nuevo formato
`sb_publishable_…`.

- **PostgREST** valida esos tokens vía JWKS: la RLS de base de datos funciona
  (`auth.uid()` resuelve; se pudo leer el perfil propio del usuario de prueba).
- **Storage** NO reconoce el token ES256 como `authenticated`: lo trata como anónimo,
  así que `auth.uid()` es null y las políticas de subida (`to authenticated`, carpeta
  propia para avatares/portadas de club; rol colaborador para portadas de ficha)
  rechazan la escritura con *"new row violates row-level security policy"*
  (HTTP 400 / statusCode RLS 403).

Confirmaciones de la reproducción (script contra el proyecto dev, mismo código que
prod):

| Prueba                                         | Resultado |
|------------------------------------------------|-----------|
| Login del usuario de prueba (ES256, role auth) | OK        |
| Lectura del perfil propio (PostgREST + RLS)    | OK        |
| Subida a `avatars` con **token de usuario**    | 400 / RLS 403 |
| Subida a `avatars` con **service_role**        | OK        |

Es decir: el bucket y las políticas están bien; lo único roto es la validación del
token de usuario **en Storage**. No es el código de subida ni las migraciones.

## Objetivos

1. Arreglar las tres subidas (avatar, portada de club, portada de ficha).
2. Mantener las claves asimétricas nuevas (no revertir la auth global del proyecto).
3. Añadir compresión **solo a la portada de ficha** (hoy sube el fichero crudo);
   avatar y club ya comprimen y se dejan como están.
4. Sin cambios en la base de datos ni migraciones.

## No-objetivos

- No se toca la relación de aspecto de la portada de club (sigue recortando a
  cuadrado; fuera de alcance).
- No se compromete avatar/club con compresión nueva (ya comprimen).
- No se cambia la persistencia existente (perfil, `cover_url`, formularios de club).

## Enfoque

Escribir en Storage desde el **servidor con la service-role key**, que sí puede
escribir (salta la RLS), tras hacer la autorización nosotros mismos. Las escrituras a
la base de datos siguen ejecutándose como el usuario (su RLS de PostgREST funciona);
**solo la llamada `.storage…upload()` usa service-role**, para minimizar el radio de
impacto.

### Principio de seguridad (obligatorio)

Como service-role salta TODA la RLS, cada server action:

- Exige sesión (`supabase.auth.getUser()`), y para la ficha además rol colaborador+
  (guard existente `requireCollaborator`).
- **Deriva la ruta del objeto del `uid` de la sesión en el servidor** (avatar/club) o
  de ids ya validados (ficha) — nunca confía en una ruta/uid/itemId enviados por el
  cliente. Esto conserva exactamente la garantía que daban las políticas RLS
  ("cada usuario solo escribe en su carpeta", "solo colaborador+ escribe portadas").
- Valida tipo y tamaño del fichero en el servidor (última palabra), como ya hace
  `uploadCover`.
- `SUPABASE_SERVICE_ROLE_KEY` se usa exclusivamente en módulos de servidor; nunca se
  expone como `NEXT_PUBLIC` ni viaja al cliente.

## Componentes

### 1. Cliente service-role (server-only)

`src/lib/supabase/service-role.ts` — factory que crea un client de supabase-js con
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, sin persistencia de sesión
(`persistSession: false`, `autoRefreshToken: false`). Comentario que explica:
- por qué existe (Storage no valida los JWT ES256 → escrituras de usuario dan RLS 403);
- que salta la RLS y por tanto **solo** debe usarse tras autorizar y con rutas
  derivadas en servidor;
- que es únicamente para escrituras a Storage.

### 2. Helper de subida compartido

En `src/lib/image/` (o junto al cliente service-role), una función:

```
uploadPublicImage(bucket, path, blob, contentType) -> { url } | { error }
```

que centraliza `.upload(path, blob, { upsert: true, contentType })` con el client
service-role, más `getPublicUrl` y el cache-bust `?v=Date.now()`. Devuelve la URL
pública o un error genérico. Reutilizada por las tres actions.

### 3. Compresión de portadas de ficha (cliente)

`src/lib/image/` gana `toContainedWebp(file, maxDimension, quality = 0.8)`:
redimensiona **preservando la relación de aspecto** (a diferencia de `toSquareWebp`,
que recorta cuadrado) de modo que el lado mayor sea ≤ `maxDimension`, y codifica WebP
con la calidad dada. Para portadas: `maxDimension = 1200`, `quality = 0.8`.
`toSquareWebp` se mantiene sin cambios para avatar/club.

### 4. Las tres server actions

- **Avatar** — `src/lib/profile/actions.ts`: `uploadAvatar(formData)`.
  - Sesión obligatoria; valida el blob (webp, tamaño máx).
  - Escribe en `${user.id}/avatar.webp` (upsert) vía `uploadPublicImage("avatars", …)`.
  - Devuelve `{ url }` con cache-bust. NO persiste el perfil (eso lo sigue haciendo el
    submit del formulario con `updateProfile`, sin cambios).

- **Portada de club** — `src/lib/clubs/` (p. ej. nuevo `club-media.ts` o dentro de
  `clubs.ts`): `uploadClubCover(formData)`.
  - Sesión obligatoria; valida el blob.
  - Escribe en `${user.id}/club-cover-${Date.now()}.webp` (el prefijo con el uid se
    mantiene para que funcione antes de que el club exista, igual que hoy).
  - Devuelve `{ url }`.

- **Ficha** — `src/lib/catalog/edit-actions.ts`: `uploadCover` (existente).
  - Cambia SOLO la llamada `.storage.from("covers").upload()` para usar el client
    service-role (vía `uploadPublicImage`). `requireCollaborator`, validaciones,
    `getPublicUrl`, la `update` de `cover_url` y `revalidateItemPage` quedan igual.

### 5. Componentes cliente

- `src/components/avatar-upload.tsx`: sigue comprimiendo con `toSquareWebp`; en vez de
  `supabase.storage…upload()` desde el cliente, hace `FormData` con el blob y llama a
  `uploadAvatar`. El input oculto `avatarUrl` se rellena con la URL devuelta (flujo de
  persistencia sin cambios).
- `src/components/clubs/club-cover-upload.tsx`: análogo con `uploadClubCover`; sigue
  llamando a `onUploaded(url)` con la URL devuelta.
- `src/components/detail/catalog-editor.tsx`: antes de llamar a `uploadCover`, comprime
  el fichero con `toContainedWebp(file, 1200, 0.8)` y envía el blob resultante. La
  validación cliente de tipo/tamaño se ajusta a que el envío ya es WebP.

## Flujo de datos

```
Cliente: elegir fichero
  -> (avatar/club) toSquareWebp   |  (ficha) toContainedWebp
  -> FormData(blob)
  -> server action (uploadAvatar / uploadClubCover / uploadCover)
       -> authz (sesión; ficha: colaborador+)
       -> ruta derivada del uid de sesión / ids validados
       -> uploadPublicImage(bucket, path, blob)  [client service-role]
       -> getPublicUrl + ?v=  -> (ficha) update cover_url + revalidate
  <- { url }
Cliente: preview / input oculto / onUploaded / revalidación de Next
```

## Manejo de errores

- Cada action devuelve un error genérico legible (patrón existente) ante: sin sesión
  (avatar/club → tratar como error; ficha ya hace `redirect("/login")`), rol
  insuficiente (ficha), tipo/tamaño inválido, o fallo de `.upload()`.
- Los componentes cliente mantienen su estado de error rojo y la reversión de la
  preview optimista (ya presente en `catalog-editor.tsx`).

## Verificación

- **Script de reproducción**: subida con token de usuario contra `avatars`/`covers`
  antes daba RLS 403; el arreglo se valida comprobando que la nueva action escribe con
  éxito y que la ruta se deriva en servidor (un uid falso del cliente no permite
  escribir en carpeta ajena).
- **E2E (Playwright)** del flujo real de al menos una superficie (avatar), según
  `docs/TESTING.md` (verificación automática es el default del proyecto).
- Comprobar que no se filtra `SUPABASE_SERVICE_ROLE_KEY` al bundle de cliente
  (búsqueda en el build / que los módulos que lo importan sean server-only).

## Riesgos y mitigaciones

- **Fuga de service-role**: mitigada manteniendo la key solo en módulos server
  (`"use server"` / sin import desde componentes cliente) y no marcándola
  `NEXT_PUBLIC`.
- **Escritura en ruta ajena**: mitigada derivando la ruta del uid de sesión, nunca del
  cliente.
- **Límite de tamaño de server action** (`bodySizeLimit: 5mb`): los blobs comprimidos
  (avatar ~decenas de KB; portada ≤ ~1200px WebP) quedan muy por debajo.

## Alternativas descartadas

- **Revertir la clave de firma JWT a HS256 legacy** en el dashboard: cero código pero
  cambia la auth de todo el proyecto y renuncia a la seguridad de las claves
  asimétricas. Descartada por el usuario.
- **Esperar a que Supabase actualice Storage para validar ES256 (JWKS)**: fuera de
  nuestro control e indeterminado en el tiempo.
- **Signed upload URLs** (`createSignedUploadUrl` + `uploadToSignedUrl`): válido y
  evita pasar los bytes por el servidor, pero innecesario aquí porque los blobs
  comprimidos son pequeños; añade una ida y vuelta extra. Se prefiere el POST directo
  a la server action por simplicidad.
