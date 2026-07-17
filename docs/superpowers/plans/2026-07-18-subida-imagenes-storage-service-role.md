# Subida de imágenes vía service-role + compresión de portadas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar las tres subidas de imagen (avatar, portada de club, portada de ficha) enrutándolas por server actions que escriben en Storage con la service-role key, y añadir compresión a la portada de ficha.

**Architecture:** El servicio de Storage de Supabase no valida los JWT ES256 de usuario (los trata como anónimos → RLS 403), pero PostgREST sí. Se escribe en Storage desde el servidor con la service-role key (salta RLS) tras autorizar nosotros y **derivar la ruta del `uid` de sesión**. Solo la llamada `.storage…upload()` usa service-role; las escrituras a la BD siguen como el usuario. Sin migraciones.

**Tech Stack:** Next.js (App Router, server actions), `@supabase/supabase-js` (client service-role, ya instalado), `@supabase/ssr` (client de servidor con cookies), canvas del navegador para compresión WebP, Playwright para e2e.

## Global Constraints

- `SUPABASE_SERVICE_ROLE_KEY` SOLO en módulos de servidor; nunca `NEXT_PUBLIC`, nunca importado desde un componente cliente.
- Toda ruta de objeto en Storage se **deriva del `uid` de la sesión en el servidor** (avatar/club) o de ids ya validados (ficha). Nunca de datos del cliente.
- Sin cambios en la base de datos ni migraciones. Las políticas RLS de Storage actuales se dejan como respaldo inerte.
- Compresión nueva SOLO en portada de ficha. Avatar y club ya comprimen con `toSquareWebp` y no se tocan en ese aspecto.
- Los blobs viajan por server actions; el límite es `bodySizeLimit: "5mb"` (next.config.ts). Los blobs comprimidos quedan muy por debajo.
- Nota de verificación: estos componentes (canvas, server actions, Storage) no son unit-testables en aislamiento en este repo. La verificación es por integración/e2e con comandos concretos, coherente con `docs/TESTING.md` (e2e automático es el default). Cada tarea termina con `npx tsc --noEmit` verde como mínimo.

---

## File structure

- Create `src/lib/supabase/service-role.ts` — factory del client service-role (server-only).
- Create `src/lib/storage/upload-public-image.ts` — helper compartido de subida (server-only).
- Create `src/lib/image/to-contained-webp.ts` — compresión WebP preservando aspecto (cliente).
- Modify `src/lib/profile/actions.ts` — añade `uploadAvatar`.
- Create `src/lib/clubs/club-media.ts` — `uploadClubCover`.
- Modify `src/lib/catalog/edit-actions.ts` — `uploadCover` escribe con service-role.
- Modify `src/components/avatar-upload.tsx` — sube vía `uploadAvatar`.
- Modify `src/components/clubs/club-cover-upload.tsx` — sube vía `uploadClubCover`.
- Modify `src/components/detail/catalog-editor.tsx` — comprime con `toContainedWebp` antes de `uploadCover`.
- Create `e2e/avatar-upload.spec.ts` — e2e del flujo de avatar.

---

## Task 1: Client service-role + helper `uploadPublicImage`

**Files:**
- Create: `src/lib/supabase/service-role.ts`
- Create: `src/lib/storage/upload-public-image.ts`

**Interfaces:**
- Produces: `createServiceRoleClient()` → client de supabase-js con service-role.
- Produces: `uploadPublicImage(bucket: string, path: string, blob: Blob, contentType: string): Promise<{ url: string } | { error: true }>`. Consumido por las Tareas 2, 3 y 4.

- [ ] **Step 1: Crear el client service-role**

`src/lib/supabase/service-role.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client con la service-role key. Existe porque el servicio de Storage de
// Supabase NO valida los JWT ES256 de usuario (los trata como anónimos, así que
// una subida de usuario cae por RLS 403); PostgREST sí los valida. Con este
// client escribimos en Storage desde el servidor SALTANDO la RLS.
//
// PELIGRO: salta TODA la RLS. Úsese SOLO para escrituras a Storage, tras
// autorizar en la server action y con una ruta DERIVADA del uid de sesión en el
// servidor (nunca de datos del cliente). Nunca se importa desde un componente
// cliente ni se expone la key como NEXT_PUBLIC.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

- [ ] **Step 2: Crear el helper de subida**

`src/lib/storage/upload-public-image.ts`:

```ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Sube un blob a un bucket público con service-role y devuelve su URL pública
// con cache-bust. Centraliza el patrón que compartían avatar-upload,
// club-cover-upload y uploadCover. NO autoriza ni valida: eso es
// responsabilidad de la server action que llama (ver service-role.ts).
export async function uploadPublicImage(
  bucket: string,
  path: string,
  blob: Blob,
  contentType: string
): Promise<{ url: string } | { error: true }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType });
  if (error) return { error: true };

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: `${publicUrl}?v=${Date.now()}` };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Prueba de integración del mecanismo service-role**

Crea un script temporal `verify-svc.cjs` en la raíz del worktree y ejecútalo (prueba que la service-role key escribe en el bucket y limpia tras de sí):

```js
const { createClient } = require("./node_modules/@supabase/supabase-js/dist/index.cjs");
const { readFileSync } = require("node:fs");
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });
  const path = "verify/svc-check.webp";
  const bytes = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
  const up = await s.storage.from("avatars").upload(path, new Blob([bytes], { type: "image/webp" }),
    { upsert: true, contentType: "image/webp" });
  console.log("upload:", up.error ? "ERR " + up.error.message : "OK");
  const { data: { publicUrl } } = s.storage.from("avatars").getPublicUrl(path);
  console.log("publicUrl:", publicUrl);
  const rm = await s.storage.from("avatars").remove([path]);
  console.log("cleanup:", rm.error ? "ERR " + rm.error.message : "OK");
})();
```

Run: `node verify-svc.cjs && rm verify-svc.cjs`
Expected: `upload: OK`, una `publicUrl`, `cleanup: OK`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/service-role.ts src/lib/storage/upload-public-image.ts
git commit -m "feat(storage): client service-role + helper uploadPublicImage"
```

---

## Task 2: Server action `uploadAvatar` + cablear `avatar-upload.tsx`

**Files:**
- Modify: `src/lib/profile/actions.ts`
- Modify: `src/components/avatar-upload.tsx`

**Interfaces:**
- Consumes: `uploadPublicImage` (Tarea 1).
- Produces: `uploadAvatar(formData: FormData): Promise<{ url?: string; error?: "generic" }>`.

- [ ] **Step 1: Añadir la action**

En `src/lib/profile/actions.ts`, añade el import y la action (junto al resto). El fichero ya es `"use server"`.

Import (arriba, junto a los existentes):

```ts
import { uploadPublicImage } from "@/lib/storage/upload-public-image";
```

Al final del fichero:

```ts
// Límites del avatar. El cliente ya comprime a WebP 512px (avatar-upload.tsx),
// así que aquí solo se acepta WebP y un tamaño holgado sobre lo esperado. El
// accept del <input> no es defensa: el tipo/tamaño se comprueban aquí.
const MAX_AVATAR_BYTES = 1 * 1024 * 1024; // 1 MB
const ALLOWED_AVATAR_TYPES = new Set(["image/webp"]);

export type UploadAvatarState = { url?: string; error?: "generic" };

// Sube el avatar comprimido a Storage con service-role (Storage no valida el
// token ES256 del usuario -> una subida de usuario cae por RLS). La ruta se
// deriva del uid de la SESIÓN, nunca del cliente, replicando la garantía de la
// política "carpeta propia". No persiste el perfil: eso sigue haciéndolo el
// submit del formulario (updateProfile) con la URL devuelta.
export async function uploadAvatar(formData: FormData): Promise<UploadAvatarState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "generic" };
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) return { error: "generic" };
  if (file.size > MAX_AVATAR_BYTES) return { error: "generic" };

  const result = await uploadPublicImage("avatars", `${user.id}/avatar.webp`, file, "image/webp");
  if ("error" in result) return { error: "generic" };
  return { url: result.url };
}
```

- [ ] **Step 2: Cablear el componente**

Reemplaza `src/components/avatar-upload.tsx` por completo:

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toSquareWebp } from "@/lib/image/to-square-webp";
import { uploadAvatar } from "@/lib/profile/actions";

const MAX_DIMENSION = 512;

// Sube el avatar vía la server action uploadAvatar (que escribe en Storage con
// service-role) y sincroniza un input oculto (avatarUrl) con la URL pública,
// para que el submit del formulario la persista vía updateProfile. La subida
// directa desde el cliente daba RLS 403 porque Storage no valida el JWT ES256.
export function AvatarUpload({
  userId: _userId,
  initialUrl,
}: {
  userId: string;
  initialUrl: string | null;
}) {
  const t = useTranslations("profile");
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [url, setUrl] = useState<string>(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(false);
    try {
      const webp = await toSquareWebp(file, MAX_DIMENSION);
      const formData = new FormData();
      formData.append("file", webp, "avatar.webp");
      const result = await uploadAvatar(formData);
      if (result.error || !result.url) throw new Error("upload failed");
      setUrl(result.url);
      setPreview(result.url);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{t("avatar")}</span>
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-muted">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- preview local/remota antes de persistir
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
        >
          {uploading ? t("avatarUploading") : t("avatarChoose")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {error && <p className="text-xs text-status-dropped">{t("avatarError")}</p>}
      {/* La server action updateProfile lee este campo tal cual. */}
      <input type="hidden" name="avatarUrl" value={url} />
    </div>
  );
}
```

Nota: se mantiene la prop `userId` (renombrada a `_userId`, ya no se usa para la ruta) para no tocar el llamador `edit-profile-form.tsx`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/profile/actions.ts src/components/avatar-upload.tsx
git commit -m "fix(avatar): subir via server action con service-role"
```

---

## Task 3: Server action `uploadClubCover` + cablear `club-cover-upload.tsx`

**Files:**
- Create: `src/lib/clubs/club-media.ts`
- Modify: `src/components/clubs/club-cover-upload.tsx`

**Interfaces:**
- Consumes: `uploadPublicImage` (Tarea 1).
- Produces: `uploadClubCover(formData: FormData): Promise<{ url?: string; error?: "generic" }>`.

- [ ] **Step 1: Crear la action**

`src/lib/clubs/club-media.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadPublicImage } from "@/lib/storage/upload-public-image";

// El cliente ya comprime a WebP 512px (club-cover-upload.tsx); aquí solo se
// acepta WebP con un tamaño holgado. El accept del <input> no es defensa.
const MAX_COVER_BYTES = 1 * 1024 * 1024; // 1 MB
const ALLOWED_COVER_TYPES = new Set(["image/webp"]);

export type UploadClubCoverState = { url?: string; error?: "generic" };

// Sube la portada de club a Storage con service-role (Storage no valida el token
// ES256 del usuario). La ruta lleva el uid de la SESIÓN como prefijo (no del
// cliente): replica la garantía "carpeta propia" y funciona antes de que el club
// exista (formulario de creación), igual que el diseño original del bucket.
export async function uploadClubCover(formData: FormData): Promise<UploadClubCoverState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "generic" };
  if (!ALLOWED_COVER_TYPES.has(file.type)) return { error: "generic" };
  if (file.size > MAX_COVER_BYTES) return { error: "generic" };

  const path = `${user.id}/club-cover-${Date.now()}.webp`;
  const result = await uploadPublicImage("avatars", path, file, "image/webp");
  if ("error" in result) return { error: "generic" };
  return { url: result.url };
}
```

- [ ] **Step 2: Cablear el componente**

Reemplaza `src/components/clubs/club-cover-upload.tsx` por completo:

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toSquareWebp } from "@/lib/image/to-square-webp";
import { uploadClubCover } from "@/lib/clubs/club-media";

const MAX_DIMENSION = 512;

// Portada de club (EPIC-05 Bloque E). Sube vía la server action uploadClubCover
// (Storage con service-role); la subida directa desde el cliente daba RLS 403
// porque Storage no valida el JWT ES256. La ruta la deriva la action del uid de
// sesión, así que ya no hace falta el userId aquí para construirla.
export function ClubCoverUpload({
  userId: _userId,
  initialUrl,
  onUploaded,
}: {
  userId: string;
  initialUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const t = useTranslations("club");
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(false);
    try {
      const webp = await toSquareWebp(file, MAX_DIMENSION);
      const formData = new FormData();
      formData.append("file", webp, "club-cover.webp");
      const result = await uploadClubCover(formData);
      if (result.error || !result.url) throw new Error("upload failed");
      setPreview(result.url);
      onUploaded(result.url);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{t("cover")}</span>
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- preview local/remota antes de persistir
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
        >
          {uploading ? t("coverUploading") : t("coverChoose")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {error && <p className="text-xs text-status-dropped">{t("coverError")}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clubs/club-media.ts src/components/clubs/club-cover-upload.tsx
git commit -m "fix(clubs): subir portada via server action con service-role"
```

---

## Task 4: `uploadCover` (ficha) escribe con service-role

**Files:**
- Modify: `src/lib/catalog/edit-actions.ts`

**Interfaces:**
- Consumes: `uploadPublicImage` (Tarea 1).
- La firma pública de `uploadCover` no cambia.

- [ ] **Step 1: Importar el helper**

En `src/lib/catalog/edit-actions.ts`, junto a los imports de arriba:

```ts
import { uploadPublicImage } from "@/lib/storage/upload-public-image";
```

- [ ] **Step 2: Reemplazar la subida a Storage**

Dentro de `uploadCover`, sustituye este bloque:

```ts
  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("covers")
    .upload(path, buffer, { upsert: true, contentType: file.type });
  if (uploadError) return { error: "generic" };

  const {
    data: { publicUrl },
  } = supabase.storage.from("covers").getPublicUrl(path);

  // El path es estable (upsert: true reemplaza el mismo objeto), así que sin
  // un parámetro de versión el navegador (o una CDN intermedia) seguiría
  // sirviendo la portada vieja tras sustituirla. Mismo patrón que
  // avatar-upload.tsx.
  const coverUrl = `${publicUrl}?v=${Date.now()}`;
```

por:

```ts
  // Escritura con service-role: Storage no valida el token ES256 del usuario
  // (una subida de usuario cae por RLS). La autorización ya la garantiza
  // requireCollaborator de arriba, y la ruta se deriva de itemType/itemId ya
  // validados, no del cliente. El cache-bust ?v= lo añade uploadPublicImage.
  const result = await uploadPublicImage("covers", path, file, file.type);
  if ("error" in result) return { error: "generic" };
  const coverUrl = result.url;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/catalog/edit-actions.ts
git commit -m "fix(catalog): subir portada de ficha con service-role"
```

---

## Task 5: Compresión de portada de ficha (`toContainedWebp`)

**Files:**
- Create: `src/lib/image/to-contained-webp.ts`
- Modify: `src/components/detail/catalog-editor.tsx`

**Interfaces:**
- Produces: `toContainedWebp(file: File, maxDimension: number, quality?: number): Promise<Blob>`.

- [ ] **Step 1: Crear el helper de compresión**

`src/lib/image/to-contained-webp.ts`:

```ts
// Redimensiona preservando la relación de aspecto (a diferencia de toSquareWebp,
// que recorta un cuadrado central) para que el lado mayor sea <= maxDimension, y
// codifica WebP con la calidad dada. Las portadas de ficha son verticales (2:3)
// y NO deben recortarse. Solo reduce (scale <= 1): nunca amplía un original
// pequeño.
export async function toContainedWebp(
  file: File,
  maxDimension: number,
  quality = 0.8
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      quality
    );
  });
}
```

- [ ] **Step 2: Comprimir antes de subir en catalog-editor**

En `src/components/detail/catalog-editor.tsx`:

(a) Añade el import junto a los demás de arriba:

```ts
import { toContainedWebp } from "@/lib/image/to-contained-webp";
```

(b) Sube el límite de tamaño del original en cliente (ahora comprimimos, así que
aceptamos originales grandes de móvil y dejamos que la compresión los reduzca).
Reemplaza:

```ts
const MAX_COVER_CLIENT_BYTES = 2 * 1024 * 1024; // 2 MB
```

por:

```ts
// El original se comprime a WebP antes de subir, así que aceptamos fotos de
// móvil grandes; el límite real (2 MB) lo aplica el servidor sobre el WebP ya
// comprimido. El tope aquí solo evita decodificar ficheros absurdos en canvas.
const MAX_COVER_CLIENT_BYTES = 15 * 1024 * 1024; // 15 MB (original)
```

(c) Dentro de `handleCoverChange`, reemplaza el bloque de envío:

```ts
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadCover(itemType, itemId, formData);
```

por:

```ts
      const webp = await toContainedWebp(file, 1200, 0.8);
      const formData = new FormData();
      formData.append("file", webp, "cover.webp");
      const result = await uploadCover(itemType, itemId, formData);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/image/to-contained-webp.ts src/components/detail/catalog-editor.tsx
git commit -m "feat(catalog): comprimir portada de ficha a WebP antes de subir"
```

---

## Task 6: e2e de avatar + verificación completa

**Files:**
- Create: `e2e/avatar-upload.spec.ts`

**Interfaces:**
- Consumes: el flujo de UI de las Tareas 2–5 y `TEST_USER_*` del entorno.

- [ ] **Step 1: Escribir el e2e de avatar**

`e2e/avatar-upload.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// PNG 1x1 rojo, válido y decodable por createImageBitmap (lo exige toSquareWebp).
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// Sube un avatar y comprueba que aparece una imagen servida desde el bucket
// `avatars` de Storage (señal fuerte de que la subida con service-role funcionó;
// la subida directa de usuario daba RLS 403). Limpieza: borra el objeto subido.
test("subir avatar: la nueva imagen se sirve desde Storage sin error", async ({ page, request }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}`);
  await page.getByRole("button", { name: /editar perfil/i }).click();

  await page.setInputFiles('input[type="file"]', {
    name: "avatar.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });

  const img = page.locator('img[src*="/storage/v1/object/public/avatars/"]');
  await expect(img.first()).toBeVisible({ timeout: 15_000 });

  // Limpieza: borrar el objeto {uid}/avatar.webp que dejó la subida. El uid se
  // obtiene del admin API por email (mismo patrón que signup.spec.ts).
  const list = await request.get(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const users = (await list.json()).users as { id: string; email: string }[];
  const uid = users.find((u) => u.email === EMAIL)?.id;
  if (uid) {
    await request.post(`${SUPABASE_URL}/storage/v1/object/remove/avatars`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      data: { prefixes: [`${uid}/avatar.webp`] },
    });
  }
});
```

- [ ] **Step 2: Arrancar dev y correr el e2e de avatar**

Run: `npm run test:e2e -- avatar-upload`
Expected: 1 passed. (Requiere `.env.local` con `TEST_USER_*` y las claves de Supabase; Playwright arranca `next dev` solo.)

- [ ] **Step 3: Verificación manual de club y ficha (qa-verifier)**

Con el dev server levantado y sesión del usuario de prueba (que es colaborador+
para la ficha), driblar en navegador:
- **Portada de club**: `/clubs` → crear/editar club → elegir imagen → la preview se
  actualiza y no aparece el error rojo (`coverError`).
- **Portada de ficha**: abrir una ficha con permiso de edición → "Editar ficha" →
  cambiar portada → la portada se actualiza y no aparece el error (`coverError`).

Verifica en la consola/network que el POST de la server action responde sin error y
que la imagen final viene de `…/storage/v1/object/public/(avatars|covers)/…`.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build correcto; sin fugas de `SUPABASE_SERVICE_ROLE_KEY` (los módulos que
la usan son server-only / `"use server"`, nunca importados desde cliente).

- [ ] **Step 5: Commit**

```bash
git add e2e/avatar-upload.spec.ts
git commit -m "test(e2e): subida de avatar via service-role"
```

---

## Self-review

- **Cobertura del spec:**
  - Cliente service-role (§Componentes 1) → Tarea 1.
  - Helper de subida (§Componentes 2) → Tarea 1.
  - Compresión de ficha `toContainedWebp` (§Componentes 3) → Tarea 5.
  - Avatar server action + cableado (§Componentes 4/5) → Tarea 2.
  - Club server action + cableado (§Componentes 4/5) → Tarea 3.
  - Ficha service-role (§Componentes 4) → Tarea 4.
  - Principio de seguridad (ruta derivada del uid, key server-only, validación
    servidor) → Tareas 1–4 (comentarios + código).
  - Verificación (script + e2e + no-fuga de key) → Tareas 1 y 6.
  - Sin migraciones → ninguna tarea toca la BD. ✓
- **Placeholders:** ninguno; todo el código va completo.
- **Consistencia de tipos:** `uploadPublicImage(...) => { url } | { error: true }` se
  consume igual en Tareas 2, 3 y 4 (`if ("error" in result)`). Las tres actions
  devuelven `{ url?, error? }` y los clientes leen `result.url` / `result.error`.
```
