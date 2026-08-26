# Respuestas por nota de voz — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comentario puede ser una nota de voz (2–60 s) en vez de texto: grabadora inline en el composer, chip reproductor compacto en el hilo, bucket privado con URL firmada, y los frenos suaves de la spec — heredando reacciones, reportes, bloqueos y notificaciones del aparato social existente.

**Spec:** `docs/superpowers/specs/2026-08-26-respuestas-nota-de-voz-design.md` (aprobada). Este plan la implementa entera (MVP §9, sin transcripción).

**Architecture:** 3 columnas nuevas en `comments` (nunca tabla aparte); subida por server action con service-role a bucket privado `voice-notes` y fila insertada con el cliente del usuario (RLS intacta); lectura con URLs firmadas en lote desde `getInteractionSummary`; en cliente, lógica pura (`src/lib/voice/*`) separada de la capa fina de `MediaRecorder` para que Vitest corra en node.

**Tech Stack:** Next.js 16 (server actions), Supabase (Postgres + Storage service-role), `MediaRecorder` + `AudioContext`/`AnalyserNode` nativos (cero dependencias npm nuevas), next-intl, Vitest, Playwright.

## Global Constraints

- **Límites (spec §7), la puerta es la server action:** duración 2 000–60 000 ms · 2 MB · mimes `audio/webm` (opus) y `audio/mp4` (AAC) · 3 audios por usuario y hilo · no 2 audios propios consecutivos en el hilo · 20 audios por usuario y día · 64 picos 0–100.
- **Migración:** `supabase/migrations/20260878_comments_voice_notes.sql` (contador secuencial; la última es `20260877`). Aplicar con `mcp__supabase-dev__apply_migration` PRIMERO; prod (`mcp__supabase-prod__apply_migration`) solo en la Tarea 15. Anexar al final de `supabase/schema-baseline.sql` en orden real de prod.
- **Grants (issue #375):** `comments` tiene INSERT de tabla completa y UPDATE por columna (`body, is_spoiler, edited_at`). Las columnas de audio NO reciben `grant update` (audio inmutable, a propósito). Tras migrar, correr la superficie 6 de `docs/DRIFT-CHECK.md` en dev (y en prod en la Tarea 15).
- **Storage siempre con service-role** desde server action (Storage no valida el JWT ES256 del usuario). El path del objeto lo construye SIEMPRE el servidor, nunca llega del cliente.
- **Nada de `use cache`** en este trabajo: todo lo que se lee depende del viewer (RLS + URLs firmadas). Regla #437.
- **Tests:** el shell trae Node v20 y Vitest revienta — antes de cualquier `npm run test*`, forzar Node 22 (`fnm use 22`). E2E reutiliza el `next dev` del puerto 3000 (no arrancar otro). Si `.env.local` no está en el worktree, copiarlo del checkout principal.
- **Commits:** Conventional Commits en español, ámbito `social` (ej.: `feat(social): el composer graba notas de voz`).
- **i18n:** locale único `es`; claves nuevas bajo `social.voice.*` en `messages/es.json` (el namespace `social` ya está en todas las rutas con hilo — no tocar `RouteMessages`).
- **localStorage:** claves `biblioshare:voice-*`; lectura SOLO vía `useSyncExternalStore` con `getServerSnapshot` (el lint `react-hooks/set-state-in-effect` veta `useState`+`useEffect`; ver doctrina en `src/components/clubs/calendar/agenda-columns.ts:10-20`).

---

### Task 1: Migración BD — columnas de audio, bucket privado y snapshot de reporte (solo dev)

**Files:**
- Create: `supabase/migrations/20260878_comments_voice_notes.sql`
- Modify: `supabase/schema-baseline.sql` (anexar al final)
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Produces: columnas `comments.audio_path text null`, `comments.audio_duration_ms integer null`, `comments.audio_peaks smallint[] null`; bucket privado `voice-notes`; CHECK texto-XOR-audio; snapshot de reporte con audio.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260878_comments_voice_notes.sql`. La rama `when 'comment'` de `prepare_content_report` hoy solo copia `body` (`supabase/migrations/20260801224621_social_interaction_targets_contract.sql:199-210`): con un audio el moderador recibiría un snapshot vacío, así que se re-crea la función entera con las claves de audio añadidas.

```sql
-- Notas de voz como comentarios (spec 2026-08-26): 3 columnas en `comments`,
-- cuerpo texto-XOR-audio, bucket privado `voice-notes` y snapshot de reporte
-- que conserva la ruta del audio (sin esto, reportar un audio llega vacío).
--
-- Grants (issue #375): INSERT en comments sigue siendo de TABLA completa, así
-- que las columnas nuevas son insertables sin tocar nada. UPDATE es por
-- columna (body, is_spoiler, edited_at) y las de audio NO se añaden a
-- propósito: una nota de voz publicada es inmutable (el MVP no edita audio).

alter table public.comments
  add column audio_path text null,
  add column audio_duration_ms integer null,
  add column audio_peaks smallint[] null;

-- El CHECK viejo exigía texto 1..2000 siempre; ahora: o texto canónico sin
-- audio, o audio con body vacío (nunca ambos, nunca ninguno — spec §6).
alter table public.comments drop constraint comments_body_canonical;
alter table public.comments add constraint comments_body_canonical check (
  body = btrim(body)
  and (
    (audio_path is null and char_length(body) between 1 and 2000)
    or (audio_path is not null and body = '')
  )
);

alter table public.comments add constraint comments_audio_canonical check (
  (audio_path is null and audio_duration_ms is null and audio_peaks is null)
  or (
    audio_path is not null
    and audio_path = btrim(audio_path)
    and audio_duration_ms between 2000 and 60000
    and coalesce(array_length(audio_peaks, 1), 0) between 0 and 64
  )
);

-- Bucket PRIVADO: sin policy de SELECT ni de INSERT sobre storage.objects —
-- nadie salvo service-role lo toca; la reproducción va por URL firmada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 2097152, array['audio/webm', 'audio/mp4'])
on conflict (id) do nothing;
```

Y a continuación, en el mismo fichero, el `create or replace function private.prepare_content_report()` **completo**: copiar el bloque entero desde `supabase/migrations/20260801224621_social_interaction_targets_contract.sql` (buscar `prepare_content_report`; va desde el `create or replace function` hasta su `$function$;`) y sustituir SOLO la rama `when 'comment' then` por:

```sql
    when 'comment' then
      -- El snapshot conserva la identidad del padre (registro canónico) y,
      -- desde las notas de voz, la ruta del audio: el moderador necesita
      -- poder escucharlo aunque el autor borre el comentario después.
      select c.author_id, jsonb_build_object(
        'body', c.body,
        'audio_path', c.audio_path,
        'audio_duration_ms', c.audio_duration_ms,
        'target_type', t.kind,
        'target_id', t.source_id,
        'created_at', c.created_at
      ) into v_reported_user_id, v_snapshot
      from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = new.target_id;
```

- [ ] **Step 2: Aplicar en dev**

`mcp__supabase-dev__apply_migration` con `name: "comments_voice_notes"` y el SQL anterior.

- [ ] **Step 3: Verificar contra objetos reales (no el ledger)**

`mcp__supabase-dev__execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'comments'
      and column_name in ('audio_path', 'audio_duration_ms', 'audio_peaks')) as columnas,
  (select count(*) from storage.buckets where id = 'voice-notes' and not public) as bucket_privado,
  (select prosrc like '%audio_path%' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'prepare_content_report') as snapshot_con_audio;
```

Expected: `columnas = 3`, `bucket_privado = 1`, `snapshot_con_audio = true`.

Probar el CHECK (debe FALLAR con `comments_body_canonical` o `comments_audio_canonical`):

```sql
-- texto y audio a la vez → error esperado
insert into public.comments (interaction_target_id, author_id, body, audio_path, audio_duration_ms)
select id, owner_id, 'hola', 'x/y.webm', 5000 from public.interaction_targets where commentable limit 1;
```

- [ ] **Step 4: Superficie 6 del DRIFT-CHECK en dev**

Correr la consulta de grants por columna de `docs/DRIFT-CHECK.md` (sección 6, `:204-219`) con `mcp__supabase-dev__execute_sql`. Expected: `comments` aparece (o sigue apareciendo) con INSERT completo (todas las columnas, ahora 12) y UPDATE solo en 3 (`body, is_spoiler, edited_at`). Si INSERT no cubre las 3 columnas nuevas, ese es el bug de #375: pararse y arreglar antes de seguir. Verificar la naturaleza del grant con:

```sql
select grantee, privilege_type, count(*)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'comments'
group by 1, 2 order by 1, 2;
```

- [ ] **Step 5: Regenerar tipos**

`mcp__supabase-dev__generate_typescript_types` y volcar el resultado a `src/lib/supabase/database.types.ts`. Comprobar que el tipo de `comments` incluye `audio_path: string | null`, `audio_duration_ms: number | null`, `audio_peaks: number[] | null`.

- [ ] **Step 6: Anexar a la baseline y commit**

Anexar el SQL completo de la migración al FINAL de `supabase/schema-baseline.sql` (orden real de aplicación, no alfabético), con un separador comentado `-- === 20260878_comments_voice_notes.sql ===`.

```bash
git add supabase/migrations/20260878_comments_voice_notes.sql supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "feat(social): comments admite nota de voz en esquema y bucket privado voice-notes"
```

---

### Task 2: Fundamentos puros — límites, picos, formato y gate compartido

**Files:**
- Create: `src/lib/voice/voice-note-limits.ts`
- Create: `src/lib/voice/peaks.ts`
- Create: `src/lib/voice/format.ts`
- Create: `src/lib/social/interaction-target-gate.ts`
- Modify: `src/lib/social/interaction-actions.ts` (usar el gate compartido)
- Test: `src/lib/voice/voice-note-limits.test.ts`, `src/lib/voice/peaks.test.ts`, `src/lib/voice/format.test.ts`

**Interfaces:**
- Produces: constantes `VOICE_MIN_DURATION_MS` (2000), `VOICE_MAX_DURATION_MS` (60000), `VOICE_COUNTDOWN_FROM_MS` (45000), `VOICE_CONFIRM_DISCARD_FROM_MS` (15000), `VOICE_MAX_BYTES`, `VOICE_MAX_PER_THREAD` (3), `VOICE_MAX_PER_DAY` (20), `VOICE_PEAK_COUNT` (64), `VOICE_ALLOWED_TYPES: ReadonlyMap<string, string>`; `baseMimeType(type: string): string`; `voiceGate(comments: readonly VoiceGateComment[]): VoiceGate`; `resamplePeaks(samples: readonly number[], count?): number[]`; `sanitizePeaks(value: unknown): number[] | null`; `formatVoiceDuration(ms: number): string`; `getInteractionTarget(supabase, interactionTargetId)` compartido.

- [ ] **Step 1: Tests de límites y gate (fallando)**

`src/lib/voice/voice-note-limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  VOICE_ALLOWED_TYPES,
  VOICE_MAX_PER_THREAD,
  baseMimeType,
  voiceGate,
  type VoiceGateComment,
} from "./voice-note-limits";

const texto = (isOwn = false): VoiceGateComment => ({ isOwn, hasAudio: false, createdAt: "2026-08-26T10:00:00Z" });
const audio = (isOwn: boolean, createdAt: string): VoiceGateComment => ({ isOwn, hasAudio: true, createdAt });

describe("baseMimeType", () => {
  it("recorta los codecs y normaliza", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType("AUDIO/MP4")).toBe("audio/mp4");
  });
  it("los dos mimes del MVP tienen extensión", () => {
    expect(VOICE_ALLOWED_TYPES.get("audio/webm")).toBe("webm");
    expect(VOICE_ALLOWED_TYPES.get("audio/mp4")).toBe("m4a");
  });
});

describe("voiceGate", () => {
  it("hilo vacío: permitido", () => {
    expect(voiceGate([])).toEqual({ allowed: true });
  });
  it("bloquea al llegar a 3 audios propios en el hilo", () => {
    const comments = [
      audio(true, "2026-08-26T10:00:00Z"),
      audio(true, "2026-08-26T10:01:00Z"),
      audio(true, "2026-08-26T10:02:00Z"),
      texto(), // otro ya respondió: el freno que actúa es el de 3, no el consecutivo
    ];
    expect(voiceGate(comments)).toEqual({ allowed: false, reason: "thread_limit" });
  });
  it("los audios de OTROS no cuentan para mi límite", () => {
    const comments = [audio(false, "1"), audio(false, "2"), audio(false, "3"), texto()];
    expect(voiceGate(comments)).toEqual({ allowed: true });
  });
  it("bloquea dos audios propios consecutivos (el último del hilo es mi audio)", () => {
    const comments = [texto(), audio(true, "2026-08-26T10:05:00Z")];
    expect(voiceGate(comments)).toEqual({ allowed: false, reason: "consecutive" });
  });
  it("cuando alguien interviene después de mi audio, se desbloquea", () => {
    const comments = [audio(true, "2026-08-26T10:00:00Z"), texto()];
    // texto() sin createdAt posterior no vale: el gate ordena por createdAt
    const despues: VoiceGateComment = { isOwn: false, hasAudio: false, createdAt: "2026-08-26T10:06:00Z" };
    expect(voiceGate([comments[0]!, despues])).toEqual({ allowed: true });
  });
  it("mi TEXTO posterior también desbloquea el freno consecutivo", () => {
    const comments = [audio(true, "2026-08-26T10:00:00Z"), { isOwn: true, hasAudio: false, createdAt: "2026-08-26T10:01:00Z" }];
    expect(voiceGate(comments)).toEqual({ allowed: true });
  });
});
```

`src/lib/voice/peaks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resamplePeaks, sanitizePeaks } from "./peaks";

describe("resamplePeaks", () => {
  it("sin muestras devuelve vacío", () => {
    expect(resamplePeaks([])).toEqual([]);
  });
  it("menos muestras que cubos: devuelve las que hay, escaladas a 0..100", () => {
    expect(resamplePeaks([0, 0.5, 1], 64)).toEqual([0, 50, 100]);
  });
  it("re-muestrea por máximo del cubo y nunca pasa de `count`", () => {
    const samples = Array.from({ length: 640 }, (_, i) => (i % 10 === 3 ? 0.8 : 0.1));
    const out = resamplePeaks(samples, 64);
    expect(out).toHaveLength(64);
    expect(Math.max(...out)).toBe(80);
  });
  it("acota los valores fuera de rango", () => {
    expect(resamplePeaks([-0.5, 1.5], 64)).toEqual([0, 100]);
  });
});

describe("sanitizePeaks", () => {
  it("acepta un array de números y lo redondea/acota", () => {
    expect(sanitizePeaks([0, 33.4, 150, -2])).toEqual([0, 33, 100, 0]);
  });
  it("rechaza lo que no es un array de números finitos o pasa de 64", () => {
    expect(sanitizePeaks("nope")).toBeNull();
    expect(sanitizePeaks([1, "2"])).toBeNull();
    expect(sanitizePeaks([Infinity])).toBeNull();
    expect(sanitizePeaks(Array.from({ length: 65 }, () => 1))).toBeNull();
  });
});
```

`src/lib/voice/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatVoiceDuration } from "./format";

describe("formatVoiceDuration", () => {
  it("formatea m:ss", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(23_000)).toBe("0:23");
    expect(formatVoiceDuration(61_499)).toBe("1:01");
  });
  it("nunca negativo", () => {
    expect(formatVoiceDuration(-500)).toBe("0:00");
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `fnm use 22; npm run test -- src/lib/voice`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar los tres módulos**

`src/lib/voice/voice-note-limits.ts`:

```ts
// Límites de las notas de voz (spec §7). Compartidos por la UI (feedback
// inmediato: mic atenuado) y la server action (la puerta real). El CHECK de
// Postgres (comments_audio_canonical) es la red de debajo, no la puerta.

export const VOICE_MIN_DURATION_MS = 2_000;
export const VOICE_MAX_DURATION_MS = 60_000;
/** A partir de aquí el timer pasa a cuenta atrás ámbar (spec §3). */
export const VOICE_COUNTDOWN_FROM_MS = 45_000;
/** Descartar/regrabar pide confirmación solo con más de esto grabado. */
export const VOICE_CONFIRM_DISCARD_FROM_MS = 15_000;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
export const VOICE_MAX_PER_THREAD = 3;
export const VOICE_MAX_PER_DAY = 20;
export const VOICE_PEAK_COUNT = 64;

/** mime base aceptado → extensión del objeto en Storage. */
export const VOICE_ALLOWED_TYPES: ReadonlyMap<string, string> = new Map([
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
]);

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMimeType(type: string): string {
  return (type.split(";")[0] ?? "").trim().toLowerCase();
}

/** Lo mínimo que el gate necesita saber de un comentario ya cargado. */
export type VoiceGateComment = {
  isOwn: boolean;
  hasAudio: boolean;
  createdAt: string;
};

export type VoiceGate =
  | { allowed: true }
  | { allowed: false; reason: "thread_limit" | "consecutive" };

/**
 * Frenos suaves por usuario y hilo (spec §4): máx 3 audios propios, y no dos
 * seguidos — si el último comentario del hilo ENTERO (no de la rama) es un
 * audio tuyo sin respuesta de nadie, el mic se atenúa. El freno diario (20)
 * es solo del servidor: el cliente no ve tus otros hilos.
 */
export function voiceGate(comments: readonly VoiceGateComment[]): VoiceGate {
  const ownAudios = comments.filter((c) => c.isOwn && c.hasAudio).length;
  if (ownAudios >= VOICE_MAX_PER_THREAD) return { allowed: false, reason: "thread_limit" };
  const last = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  if (last?.isOwn && last.hasAudio) return { allowed: false, reason: "consecutive" };
  return { allowed: true };
}
```

`src/lib/voice/peaks.ts`:

```ts
// 64 picos 0..100 para la waveform: se calculan en el cliente al grabar y se
// persisten en comments.audio_peaks (smallint[]). Puro: testeable en node.
import { VOICE_PEAK_COUNT } from "./voice-note-limits";

function toPercent(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

/**
 * Reduce las muestras de amplitud (0..1, una por tick del AnalyserNode) a
 * `count` cubos, quedándose con el MÁXIMO de cada cubo (el pico, no la media:
 * una waveform de medias sale plana). Menos muestras que cubos → se devuelven
 * las que haya (una grabación corta pinta menos barras).
 */
export function resamplePeaks(samples: readonly number[], count = VOICE_PEAK_COUNT): number[] {
  if (samples.length === 0) return [];
  if (samples.length <= count) return samples.map(toPercent);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * samples.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / count));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, samples[j] ?? 0);
    out.push(toPercent(max));
  }
  return out;
}

/**
 * Valida y sanea los picos que llegan del cliente a la server action: array
 * de ≤64 números finitos, redondeados y acotados a 0..100. Cualquier otra
 * cosa → null (la nota se publica sin waveform, no se rechaza por esto).
 */
export function sanitizePeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > VOICE_PEAK_COUNT) return null;
  const out: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out.push(Math.max(0, Math.min(100, Math.round(v))));
  }
  return out;
}
```

`src/lib/voice/format.ts`:

```ts
/** 23_000 → "0:23". Para el chip, la grabadora y la mini-barra. */
export function formatVoiceDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Extraer `getInteractionTarget` a un módulo compartido**

Hoy es una función privada de `interaction-actions.ts:13-27` y NO se puede exportar desde ahí: en un fichero `"use server"` todo export se convierte en server action, y esta recibe un cliente Supabase (no serializable). Crear `src/lib/social/interaction-target-gate.ts`:

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// La puerta de superficie de TODO lo que escribe sobre un target: existe,
// es comentable/reaccionable y con qué tipo de notificación. Extraída de
// interaction-actions.ts para que voice-note-actions.ts la comparta sin
// convertirla en server action.
export async function getInteractionTarget(
  supabase: SupabaseServerClient,
  interactionTargetId: string,
) {
  const { data, error } = await supabase
    .from("interaction_targets")
    .select(
      "id, owner_id, commentable, reactable, comment_notification_type, reaction_notification_type",
    )
    .eq("id", interactionTargetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("interaction_target_not_found");
  return data;
}
```

En `src/lib/social/interaction-actions.ts`: borrar la función local (líneas 11-27, dejando el type alias si algo más lo usa) e importar `import { getInteractionTarget } from "./interaction-target-gate";`.

- [ ] **Step 5: Verificar que todo pasa**

Run: `fnm use 22; npm run test -- src/lib/voice src/lib/social`
Expected: PASS (los nuevos y los existentes de `interaction-actions`/`post-actions`, que cubren el refactor del gate).

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice src/lib/social/interaction-target-gate.ts src/lib/social/interaction-actions.ts
git commit -m "feat(social): limites, picos y gate compartido para las notas de voz"
```

---

### Task 3: Contexto de notificación de una nota de voz

**Files:**
- Modify: `src/lib/social/notification-context.ts`
- Test: `src/lib/social/notification-context.test.ts` (existe: añadir casos; si no existe, crearlo)

**Interfaces:**
- Consumes: `NotificationContext` (`notification-context.ts:15-24`).
- Produces: `voiceCommentContext(isSpoiler: boolean): NotificationContext`.

Sin esto, `commentContext("")` devuelve `{}` y la campana/push de un audio queda con la copia genérica (trampa detectada en la exploración). `notifyMentions` NO se toca: sin texto no hay `@menciones` que parsear (decisión de spec §6, MVP sin transcripción).

- [ ] **Step 1: Test (fallando)**

Añadir a `src/lib/social/notification-context.test.ts` (crearlo con este contenido si no existe):

```ts
import { describe, expect, it } from "vitest";
import { voiceCommentContext } from "./notification-context";

describe("voiceCommentContext", () => {
  it("sin spoiler: extracto fijo de nota de voz", () => {
    expect(voiceCommentContext(false)).toEqual({ excerpt: "🎙️ Nota de voz" });
  });
  it("spoiler: se marca y no se dice nada más (mismo criterio que commentContext)", () => {
    expect(voiceCommentContext(true)).toEqual({ spoiler: true });
  });
});
```

Run: `fnm use 22; npm run test -- src/lib/social/notification-context`
Expected: FAIL — `voiceCommentContext` no existe.

- [ ] **Step 2: Implementar**

Añadir al final de `src/lib/social/notification-context.ts`:

```ts
/**
 * Contexto de la notificación de una nota de voz: no hay texto que extractar,
 * el excerpt dice qué es. Viaja ya localizado (locale único `es`) porque el
 * lector (notification-copy) pinta el excerpt tal cual.
 */
export function voiceCommentContext(isSpoiler: boolean): NotificationContext {
  if (isSpoiler) return { spoiler: true };
  return { excerpt: "🎙️ Nota de voz" };
}
```

- [ ] **Step 3: Verificar y commit**

Run: `fnm use 22; npm run test -- src/lib/social/notification-context`
Expected: PASS.

```bash
git add src/lib/social/notification-context.ts src/lib/social/notification-context.test.ts
git commit -m "feat(social): la notificacion de una nota de voz dice que lo es"
```

---

### Task 4: Storage — subir, borrar y firmar URLs del bucket privado

**Files:**
- Create: `src/lib/storage/voice-notes.ts`
- Test: `src/lib/storage/voice-notes.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()` (`src/lib/supabase/service-role.ts:10`); bucket `voice-notes` (Tarea 1).
- Produces: `uploadVoiceNote(path: string, blob: Blob, contentType: string): Promise<{ ok: true } | { error: true }>`; `deleteVoiceNote(path: string): Promise<void>`; `signVoiceNoteUrls(paths: string[]): Promise<Map<string, string>>`; `VOICE_SIGNED_URL_TTL_SECONDS = 3600`.

Primer uso de bucket privado + URL firmada del repo (`createSignedUrls` no aparece en `src/` hoy). Mismo contrato que `upload-public-image.ts:6-7`: este módulo NO autoriza ni valida — eso es de la server action que llama.

- [ ] **Step 1: Test (fallando)**

`src/lib/storage/voice-notes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ storage: { from: () => storage } }),
}));

import { deleteVoiceNote, signVoiceNoteUrls, uploadVoiceNote } from "./voice-notes";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadVoiceNote", () => {
  it("sube sin upsert (el path lleva uuid nuevo; un choque es un bug)", async () => {
    storage.upload.mockResolvedValue({ error: null });
    const blob = new Blob(["x"], { type: "audio/webm" });
    const res = await uploadVoiceNote("u1/a.webm", blob, "audio/webm");
    expect(res).toEqual({ ok: true });
    expect(storage.upload).toHaveBeenCalledWith("u1/a.webm", blob, {
      contentType: "audio/webm",
      upsert: false,
    });
  });
  it("error de storage → { error: true }, sin lanzar", async () => {
    storage.upload.mockResolvedValue({ error: { message: "boom" } });
    await expect(uploadVoiceNote("u1/a.webm", new Blob(["x"]), "audio/webm")).resolves.toEqual({
      error: true,
    });
  });
});

describe("deleteVoiceNote", () => {
  it("borra y no lanza aunque falle (huérfano: se loguea)", async () => {
    storage.remove.mockResolvedValue({ error: { message: "boom" } });
    await expect(deleteVoiceNote("u1/a.webm")).resolves.toBeUndefined();
    expect(storage.remove).toHaveBeenCalledWith(["u1/a.webm"]);
  });
});

describe("signVoiceNoteUrls", () => {
  it("sin paths no llama a storage", async () => {
    await expect(signVoiceNoteUrls([])).resolves.toEqual(new Map());
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
  it("mapea path → signedUrl y descarta filas con error", async () => {
    storage.createSignedUrls.mockResolvedValue({
      data: [
        { path: "u1/a.webm", signedUrl: "https://x/a?token=1", error: null },
        { path: "u1/b.m4a", signedUrl: null, error: "not found" },
      ],
      error: null,
    });
    const map = await signVoiceNoteUrls(["u1/a.webm", "u1/b.m4a"]);
    expect(map.get("u1/a.webm")).toBe("https://x/a?token=1");
    expect(map.has("u1/b.m4a")).toBe(false);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(["u1/a.webm", "u1/b.m4a"], 3600);
  });
});
```

Run: `fnm use 22; npm run test -- src/lib/storage/voice-notes`
Expected: FAIL — módulo inexistente.

- [ ] **Step 2: Implementar**

`src/lib/storage/voice-notes.ts`:

```ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Bucket PRIVADO `voice-notes` (migración 20260878): sin URL pública ni policy
// de SELECT — el audio respeta bloqueos y privacidad exactamente igual que el
// comentario que lo contiene, porque solo se llega a él por URL firmada
// generada al renderizar el hilo. Como toda subida del proyecto, va con
// service-role: Storage no valida el token ES256 del usuario (ver
// catalog/edit-actions.ts:218-221). Este módulo NO autoriza ni valida: eso es
// responsabilidad de la server action que llama (mismo contrato que
// upload-public-image.ts).

const BUCKET = "voice-notes";

/** Caducidad de la URL firmada: 1 h (spec §6). */
export const VOICE_SIGNED_URL_TTL_SECONDS = 3600;

export async function uploadVoiceNote(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<{ ok: true } | { error: true }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: false, // el path lleva un uuid recién generado; un choque es un bug
  });
  if (error) {
    console.error("uploadVoiceNote failed", error);
    return { error: true };
  }
  return { ok: true };
}

/** Falla en silencio (log): un objeto huérfano no debe romper un borrado. */
export async function deleteVoiceNote(path: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("deleteVoiceNote failed", error);
}

/** URLs firmadas en LOTE para el render del hilo (una llamada por resumen). */
export async function signVoiceNoteUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, VOICE_SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("signVoiceNoteUrls failed", error);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}
```

- [ ] **Step 3: Verificar y commit**

Run: `fnm use 22; npm run test -- src/lib/storage/voice-notes`
Expected: PASS.

```bash
git add src/lib/storage/voice-notes.ts src/lib/storage/voice-notes.test.ts
git commit -m "feat(social): subida, borrado y firma de URLs del bucket voice-notes"
```

---

### Task 5: Lectura — el tipo `audio` en `InteractionComment` y URLs firmadas en el resumen

**Files:**
- Modify: `src/lib/social/interactions.ts:54-78` (tipo)
- Modify: `src/lib/social/get-interaction-summary.ts` (select + firma + mapeo)
- Modify: `src/components/social/post-thread.tsx` (`newOptimistic`, ~:119-142)
- Modify: `src/components/social/review-interactions.tsx` (`newOptimistic`, ~:128-151)

**Interfaces:**
- Consumes: `signVoiceNoteUrls` (Tarea 4).
- Produces: `InteractionComment.audio: { url: string; durationMs: number; peaks: number[] } | null`.

- [ ] **Step 1: Ampliar el tipo**

En `src/lib/social/interactions.ts`, dentro de `InteractionComment` (tras `edited: boolean;`):

```ts
  /**
   * Nota de voz: null en comentarios de texto. `url` es una URL FIRMADA con
   * caducidad 1 h — no cachear más allá del render que la trajo.
   */
  audio: { url: string; durationMs: number; peaks: number[] } | null;
```

- [ ] **Step 2: Ampliar el lector**

En `src/lib/social/get-interaction-summary.ts`:

1. Import: `import { signVoiceNoteUrls } from "@/lib/storage/voice-notes";`
2. El select de comentarios (`:105`) pasa a:

```ts
      .select(
        "id, interaction_target_id, author_id, body, created_at, parent_id, is_spoiler, pinned, edited_at, audio_path, audio_duration_ms, audio_peaks",
      )
```

3. El `Promise.all` de `:130-136` gana un tercer miembro (una sola llamada de firma por lote):

```ts
  const [nameByAuthor, commentTargetRefs, audioUrls] = await Promise.all([
    resolveAuthorNames(supabase, authorIds),
    getInteractionTargetRefs(
      supabase,
      commentRows.map((comment) => ({ kind: "comment", sourceId: comment.id })),
    ),
    signVoiceNoteUrls([
      ...new Set(
        commentRows
          .map((c) => c.audio_path)
          .filter((p): p is string => p != null),
      ),
    ]),
  ]);
```

4. En el objeto que se hace `s.comments.push({ ... })` (`:188-212`):
   - `canEdit` pasa a `canEdit: user?.id === c.author_id && c.audio_path == null,` (el audio no se edita en el MVP; el CHECK de BD lo impediría igualmente).
   - Tras `edited: c.edited_at != null,` añadir:

```ts
      // Si la firma falló (objeto perdido, storage caído) el comentario se
      // pinta como texto vacío en vez de un chip roto: audio null y a seguir.
      audio:
        c.audio_path && audioUrls.get(c.audio_path)
          ? {
              url: audioUrls.get(c.audio_path)!,
              durationMs: c.audio_duration_ms ?? 0,
              peaks: (c.audio_peaks ?? []).map(Number),
            }
          : null,
```

- [ ] **Step 3: Placeholders optimistas**

El typecheck ahora obliga: en `src/components/social/post-thread.tsx` (`newOptimistic`, ~:119-142) y `src/components/social/review-interactions.tsx` (~:128-151), añadir `audio: null,` al objeto del comentario optimista de texto.

- [ ] **Step 4: Verificar**

Run: `fnm use 22; npx tsc --noEmit; npm run test`
Expected: typecheck limpio y suite en verde (ningún test existente construye `InteractionComment` a mano fuera de los dos placeholders; si alguno más falla por el campo nuevo, añadirle `audio: null`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/get-interaction-summary.ts src/components/social/post-thread.tsx src/components/social/review-interactions.tsx
git commit -m "feat(social): los comentarios cargan su nota de voz con URL firmada"
```

---

### Task 6: Server action `addVoiceComment`

**Files:**
- Create: `src/lib/social/voice-note-actions.ts`
- Test: `src/lib/social/voice-note-actions.test.ts`

**Interfaces:**
- Consumes: `getInteractionTarget` (Tarea 2), `uploadVoiceNote`/`deleteVoiceNote` (Tarea 4), `voiceCommentContext` (Tarea 3), `sanitizePeaks` (Tarea 2), `notify` (`src/lib/social/notifications.ts:25`), `revalidateInteraction` (`src/lib/reactivity/revalidate.ts`), `CommentActionResult` (import type de `interaction-actions.ts`).
- Produces: `addVoiceComment(interactionTargetId: string, formData: FormData, opts?: { parentId?: string; isSpoiler?: boolean }): Promise<CommentActionResult>`. FormData: `file` (File), `durationMs` (string numérica), `peaks` (JSON de number[]).

Errores nuevos que devuelve (los consume la Tarea 12): `invalid_audio`, `too_large`, `invalid_duration`, `upload_failed`, `voice_thread_limit`, `voice_consecutive`, `voice_daily_limit` — más los heredados `unauthenticated`, `not_commentable`, `unknown`.

Secuencia de la spec §6: validar → subir objeto → insertar fila (cliente del USUARIO: RLS y trigger de comentabilidad intactos); si el insert falla, borrar el objeto. Los frenos se comprueban con service-role (el diario cruza hilos que el cliente no ve).

- [ ] **Step 1: Test (fallando)**

`src/lib/social/voice-note-actions.test.ts` — mismo patrón de doble manual que `post-actions.test.ts` (`vi.hoisted` + builders encadenables):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    user: { id: "user-1" } as { id: string } | null,
    target: {
      id: "target-1",
      owner_id: "owner-1",
      commentable: true,
      reactable: true,
      comment_notification_type: "commented",
      reaction_notification_type: "reacted",
    } as Record<string, unknown> | null,
    threadCount: 0,
    dayCount: 0,
    lastComment: null as { author_id: string; audio_path: string | null } | null,
    insertError: null as { message: string } | null,
    inserted: { id: "comment-1", parent_id: null as string | null },
    insertedRows: [] as Array<Record<string, unknown>>,
  };

  // Cliente del usuario: auth + insert en comments + lookup del target del comentario.
  const userClient = {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      if (table === "interaction_targets") {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: "comment-target-1" }, error: null }) }),
              maybeSingle: async () => ({ data: state.target, error: null }),
            }),
          }),
        };
      }
      // comments
      return {
        insert: (row: Record<string, unknown>) => {
          state.insertedRows.push(row);
          return {
            select: () => ({
              single: async () =>
                state.insertError
                  ? { data: null, error: state.insertError }
                  : { data: state.inserted, error: null },
            }),
          };
        },
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    },
  };

  // Cliente service-role: solo los conteos de los frenos.
  function countBuilder(result: () => { count?: number; data?: unknown }) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "gte", "order", "limit"]) {
      b[m] = () => b;
    }
    b.maybeSingle = async () => ({ data: state.lastComment, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ ...result(), error: null });
    return b;
  }
  let adminCall = 0;
  const adminClient = {
    from: () => {
      adminCall += 1;
      const call = adminCall;
      if (call % 3 === 1) return countBuilder(() => ({ count: state.threadCount }));
      if (call % 3 === 2) return countBuilder(() => ({ data: state.lastComment }));
      return countBuilder(() => ({ count: state.dayCount }));
    },
  };

  return {
    state,
    resetAdmin: () => (adminCall = 0),
    userClient,
    adminClient,
    uploadVoiceNote: vi.fn(async () => ({ ok: true }) as { ok: true } | { error: true }),
    deleteVoiceNote: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
    revalidateInteraction: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.userClient }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => h.adminClient }));
vi.mock("@/lib/storage/voice-notes", () => ({
  uploadVoiceNote: h.uploadVoiceNote,
  deleteVoiceNote: h.deleteVoiceNote,
}));
vi.mock("./notifications", () => ({ notify: h.notify }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateInteraction: h.revalidateInteraction }));

import { addVoiceComment } from "./voice-note-actions";

function makeFormData(overrides?: { type?: string; size?: number; durationMs?: string; peaks?: string }) {
  const fd = new FormData();
  const bytes = new Uint8Array(overrides?.size ?? 1000);
  fd.set("file", new File([bytes], "nota.webm", { type: overrides?.type ?? "audio/webm;codecs=opus" }));
  fd.set("durationMs", overrides?.durationMs ?? "5000");
  fd.set("peaks", overrides?.peaks ?? JSON.stringify([10, 50, 90]));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.resetAdmin();
  h.state.user = { id: "user-1" };
  h.state.threadCount = 0;
  h.state.dayCount = 0;
  h.state.lastComment = null;
  h.state.insertError = null;
  h.state.insertedRows = [];
  h.uploadVoiceNote.mockResolvedValue({ ok: true });
});

describe("addVoiceComment", () => {
  it("camino feliz: sube, inserta body vacío con audio y notifica al dueño", async () => {
    const res = await addVoiceComment("target-1", makeFormData());
    expect(res).toEqual({ ok: true });
    expect(h.uploadVoiceNote).toHaveBeenCalledTimes(1);
    const [path, , contentType] = h.uploadVoiceNote.mock.calls[0]!;
    expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.webm$/);
    expect(contentType).toBe("audio/webm");
    const row = h.state.insertedRows[0]!;
    expect(row.body).toBe("");
    expect(row.audio_path).toBe(path);
    expect(row.audio_duration_ms).toBe(5000);
    expect(row.audio_peaks).toEqual([10, 50, 90]);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.revalidateInteraction).toHaveBeenCalled();
  });

  it("sin sesión → unauthenticated y NO sube nada", async () => {
    h.state.user = null;
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "unauthenticated" });
    expect(h.uploadVoiceNote).not.toHaveBeenCalled();
  });

  it("mime no permitido → invalid_audio", async () => {
    expect(await addVoiceComment("target-1", makeFormData({ type: "audio/ogg" }))).toEqual({ ok: false, error: "invalid_audio" });
  });

  it("más de 2 MB → too_large", async () => {
    expect(await addVoiceComment("target-1", makeFormData({ size: 2 * 1024 * 1024 + 1 }))).toEqual({ ok: false, error: "too_large" });
  });

  it("duración fuera de 2s–60s → invalid_duration", async () => {
    expect(await addVoiceComment("target-1", makeFormData({ durationMs: "1500" }))).toEqual({ ok: false, error: "invalid_duration" });
    expect(await addVoiceComment("target-1", makeFormData({ durationMs: "61000" }))).toEqual({ ok: false, error: "invalid_duration" });
  });

  it("3 audios ya en el hilo → voice_thread_limit", async () => {
    h.state.threadCount = 3;
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "voice_thread_limit" });
    expect(h.uploadVoiceNote).not.toHaveBeenCalled();
  });

  it("mi último comentario del hilo es un audio → voice_consecutive", async () => {
    h.state.lastComment = { author_id: "user-1", audio_path: "user-1/x.webm" };
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "voice_consecutive" });
  });

  it("20 audios hoy → voice_daily_limit", async () => {
    h.state.dayCount = 20;
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "voice_daily_limit" });
  });

  it("si el insert falla, borra el objeto subido (sin huérfanos)", async () => {
    h.state.insertError = { message: "boom" };
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "unknown" });
    expect(h.deleteVoiceNote).toHaveBeenCalledWith(h.uploadVoiceNote.mock.calls[0]![0]);
  });

  it("peaks corruptos no tumban la publicación: van como []", async () => {
    const res = await addVoiceComment("target-1", makeFormData({ peaks: '"no-array"' }));
    expect(res).toEqual({ ok: true });
    expect(h.state.insertedRows[0]!.audio_peaks).toEqual([]);
  });
});
```

Run: `fnm use 22; npm run test -- src/lib/social/voice-note-actions`
Expected: FAIL — módulo inexistente.

- [ ] **Step 2: Implementar**

`src/lib/social/voice-note-actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidateInteraction } from "@/lib/reactivity/revalidate";
import { deleteVoiceNote, uploadVoiceNote } from "@/lib/storage/voice-notes";
import { sanitizePeaks } from "@/lib/voice/peaks";
import {
  VOICE_ALLOWED_TYPES,
  VOICE_MAX_BYTES,
  VOICE_MAX_DURATION_MS,
  VOICE_MAX_PER_DAY,
  VOICE_MAX_PER_THREAD,
  VOICE_MIN_DURATION_MS,
  baseMimeType,
} from "@/lib/voice/voice-note-limits";
import { getInteractionTarget } from "./interaction-target-gate";
import { notify } from "./notifications";
import { voiceCommentContext } from "./notification-context";
import type { CommentActionResult } from "./interaction-actions";

/**
 * Publica una nota de voz como comentario (spec §6): validar → subir el
 * objeto (service-role, el usuario no puede escribir en Storage) → insertar la
 * fila con el cliente del USUARIO (RLS y trigger de comentabilidad intactos).
 * Si el insert falla, el objeto recién subido se borra: cero huérfanos.
 *
 * Los frenos de §7 se miran aquí porque esta action es la única vía de
 * escritura; la UI solo atenúa el mic. El diario (20/día) cruza hilos que el
 * cliente ni ve, por eso los conteos van con service-role.
 */
export async function addVoiceComment(
  interactionTargetId: string,
  formData: FormData,
  opts?: { parentId?: string; isSpoiler?: boolean },
): Promise<CommentActionResult> {
  let orphanPath: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "invalid_audio" };
    const mime = baseMimeType(file.type);
    const ext = VOICE_ALLOWED_TYPES.get(mime);
    if (!ext) return { ok: false, error: "invalid_audio" };
    if (file.size > VOICE_MAX_BYTES) return { ok: false, error: "too_large" };

    const durationMs = Math.round(Number(formData.get("durationMs")));
    if (
      !Number.isFinite(durationMs) ||
      durationMs < VOICE_MIN_DURATION_MS ||
      durationMs > VOICE_MAX_DURATION_MS
    ) {
      return { ok: false, error: "invalid_duration" };
    }

    // Waveform: si viene corrupta se publica sin ella, no se rechaza.
    let peaks: number[] = [];
    const rawPeaks = formData.get("peaks");
    if (typeof rawPeaks === "string" && rawPeaks) {
      try {
        peaks = sanitizePeaks(JSON.parse(rawPeaks)) ?? [];
      } catch {
        peaks = [];
      }
    }

    const target = await getInteractionTarget(supabase, interactionTargetId);
    if (!target.commentable || !target.comment_notification_type) {
      return { ok: false, error: "not_commentable" };
    }

    const admin = createServiceRoleClient();
    const [threadRes, lastRes, dayRes] = await Promise.all([
      admin
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("interaction_target_id", interactionTargetId)
        .eq("author_id", user.id)
        .not("audio_path", "is", null),
      admin
        .from("comments")
        .select("author_id, audio_path")
        .eq("interaction_target_id", interactionTargetId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id)
        .not("audio_path", "is", null)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    if ((threadRes.count ?? 0) >= VOICE_MAX_PER_THREAD) {
      return { ok: false, error: "voice_thread_limit" };
    }
    if (lastRes.data && lastRes.data.author_id === user.id && lastRes.data.audio_path) {
      return { ok: false, error: "voice_consecutive" };
    }
    if ((dayRes.count ?? 0) >= VOICE_MAX_PER_DAY) {
      return { ok: false, error: "voice_daily_limit" };
    }

    // El path lo construye el servidor SIEMPRE (nada del cliente): la spec
    // pedía <comment_id>.<ext>, pero el id no existe hasta el insert y la
    // secuencia manda subir antes; un uuid fresco cumple lo mismo (no
    // adivinable, un objeto por nota).
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await uploadVoiceNote(path, file, mime);
    if ("error" in uploaded) return { ok: false, error: "upload_failed" };
    orphanPath = path;

    const { data: inserted, error } = await supabase
      .from("comments")
      .insert({
        interaction_target_id: interactionTargetId,
        author_id: user.id,
        body: "",
        parent_id: opts?.parentId ?? null,
        is_spoiler: opts?.isSpoiler ?? false,
        audio_path: path,
        audio_duration_ms: durationMs,
        audio_peaks: peaks,
      })
      .select("id, parent_id")
      .single();
    if (error) throw error;
    orphanPath = null; // la fila existe: el objeto ya no es huérfano

    // Notificaciones: mismas dos rutas que addComment (dueño del target y
    // autor del padre) con la copia de voz. SIN notifyMentions: no hay texto
    // del que parsear @menciones (spec §6, MVP sin transcripción).
    const context = voiceCommentContext(opts?.isSpoiler ?? false);
    let commentTargetId: string | null = null;
    try {
      const { data: commentTarget } = await supabase
        .from("interaction_targets")
        .select("id")
        .eq("kind", "comment")
        .eq("source_id", inserted.id)
        .maybeSingle();
      commentTargetId = commentTarget?.id ?? null;
    } catch (e) {
      console.error(e);
    }

    if (target.owner_id !== user.id) {
      try {
        await notify(supabase, {
          userId: target.owner_id,
          actorId: user.id,
          type: target.comment_notification_type,
          interactionTargetId,
          context,
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (inserted.parent_id) {
      try {
        const { data: parent } = await supabase
          .from("comments")
          .select("author_id")
          .eq("id", inserted.parent_id)
          .maybeSingle();
        if (parent && parent.author_id !== user.id && parent.author_id !== target.owner_id) {
          await notify(supabase, {
            userId: parent.author_id,
            actorId: user.id,
            type: target.comment_notification_type,
            // Deep-link al subhilo (#c-<id>), igual que addComment:190-216.
            interactionTargetId: commentTargetId ?? interactionTargetId,
            dedupeKey: `reply:${inserted.id}`,
            context,
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("addVoiceComment failed", e);
    return { ok: false, error: "unknown" };
  } finally {
    if (orphanPath) await deleteVoiceNote(orphanPath);
  }
}
```

> Nota para el test del camino feliz: el doble de `interaction_targets` distingue el lookup del gate (un `.eq().maybeSingle()`) del lookup del target del comentario (`.eq().eq().maybeSingle()`) — está resuelto así en el mock de arriba. Si al implementar cambias el orden de las llamadas, ajusta el doble, no la implementación.

- [ ] **Step 3: Verificar que pasa**

Run: `fnm use 22; npm run test -- src/lib/social/voice-note-actions`
Expected: PASS (los 10 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/voice-note-actions.ts src/lib/social/voice-note-actions.test.ts
git commit -m "feat(social): addVoiceComment publica notas de voz con los frenos del servidor"
```

---

### Task 7: `deleteComment` limpia el objeto de Storage

**Files:**
- Modify: `src/lib/social/interaction-actions.ts:278-294`
- Test: `src/lib/social/interaction-actions.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `deleteVoiceNote` (Tarea 4).
- Produces: `deleteComment` sin cambio de firma; además de borrar la fila, borra el audio si lo hay. De paso arregla el falso `ok:true` cuando RLS bloquea (hoy no hay `.select()` y 0 filas pasan por éxito).

- [ ] **Step 1: Tests (fallando)**

Añadir a `src/lib/social/interaction-actions.test.ts`, siguiendo el patrón de dobles ya presente en ese fichero (builders encadenables + `vi.mock`); mockear también `@/lib/storage/voice-notes`:

```ts
// dentro del describe de deleteComment (o uno nuevo):
it("al borrar un comentario con audio, borra también el objeto de Storage", async () => {
  // el doble del delete debe devolver data: [{ id: "c1", audio_path: "u1/a.webm" }]
  const res = await deleteComment("c1");
  expect(res).toEqual({ ok: true });
  expect(deleteVoiceNoteMock).toHaveBeenCalledWith("u1/a.webm");
});

it("comentario de texto: no toca Storage", async () => {
  // data: [{ id: "c1", audio_path: null }]
  await deleteComment("c1");
  expect(deleteVoiceNoteMock).not.toHaveBeenCalled();
});

it("RLS bloquea (0 filas) → not_allowed_or_missing, no ok silencioso", async () => {
  // data: []
  expect(await deleteComment("c1")).toEqual({ ok: false, error: "not_allowed_or_missing" });
});
```

Run: `fnm use 22; npm run test -- src/lib/social/interaction-actions`
Expected: FAIL.

- [ ] **Step 2: Implementar**

En `deleteComment` (`interaction-actions.ts:286-288`), sustituir el delete pelado por:

```ts
    // `.select` con RETURNING: distingue 0 filas (RLS bloqueó) de éxito — el
    // delete sin select devolvía ok:true aunque no borrara nada — y trae el
    // audio_path para limpiar Storage (la cascada de Postgres no lo hace).
    const { data: deleted, error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .select("id, audio_path");
    if (error) throw error;
    if (!deleted || deleted.length === 0) {
      return { ok: false, error: "not_allowed_or_missing" };
    }
    const audioPath = deleted[0]?.audio_path;
    if (audioPath) await deleteVoiceNote(audioPath);
```

Con `import { deleteVoiceNote } from "@/lib/storage/voice-notes";` arriba.

> Los consumidores tratan cualquier `{ok:false}` lanzando en `throwIfFailed` → rollback optimista + `actionError` genérico. Comportamiento correcto para este caso; no hay que tocar UI.

- [ ] **Step 3: Verificar y commit**

Run: `fnm use 22; npm run test -- src/lib/social/interaction-actions`
Expected: PASS.

```bash
git add src/lib/social/interaction-actions.ts src/lib/social/interaction-actions.test.ts
git commit -m "fix(social): borrar un comentario con audio limpia Storage y detecta el bloqueo de RLS"
```

---

### Task 8: Iconos, i18n y el stub de analítica

**Files:**
- Modify: `src/components/ui/icons.tsx`
- Modify: `messages/es.json` (namespace `social`, subobjeto nuevo `voice`)
- Create: `src/lib/voice/voice-note-analytics.ts`

**Interfaces:**
- Produces: `MicIcon`, `PlayIcon`, `PauseIcon`, `StopIcon` (mismo contrato `(props: SVGProps<SVGSVGElement>)` que los 39 existentes); claves `social.voice.*`; `logVoiceNote(name: VoiceNoteAnalyticsEvent, context?: VoiceNoteAnalyticsContext): void`.

- [ ] **Step 1: Iconos**

Añadir a `src/components/ui/icons.tsx`, imitando el estilo de los existentes (stroke, `viewBox="0 0 24 24"`, spread de props):

```tsx
export function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  );
}

export function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.4-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5Z" />
    </svg>
  );
}

export function PauseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  );
}

export function StopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
```

(Antes de añadirlos, comprobar con grep que no existen ya con otro nombre — `Grep "PlayIcon|MicIcon" src/components/ui/icons.tsx`.)

- [ ] **Step 2: Claves i18n**

En `messages/es.json`, dentro del namespace `social` (junto a los subobjetos `emojiPicker`/`reportReason` ya anidados), añadir:

```json
"voice": {
  "record": "Grabar una nota de voz",
  "firstTimeTip": "Ahora puedes responder con tu voz",
  "recording": "Grabando",
  "pause": "Pausar",
  "resume": "Reanudar",
  "stop": "Parar",
  "cancel": "Cancelar la grabación",
  "confirmDiscard": "¿Descartar la nota de voz?",
  "discard": "Descartar",
  "keep": "Seguir",
  "rerecord": "Regrabar",
  "publish": "Publicar",
  "publishing": "Publicando…",
  "uploadFailed": "No se pudo publicar",
  "retry": "Reintentar",
  "play": "Reproducir la nota de voz",
  "pausePlayback": "Pausar la reproducción",
  "seek": "Saltar a otro punto de la nota",
  "speed": "Velocidad de reproducción",
  "voiceNote": "Nota de voz",
  "micDenied": "El micrófono está bloqueado. Actívalo en los ajustes del navegador y recarga.",
  "limitThread": "Ya has dejado 3 notas de voz en este hilo — sigue por texto",
  "limitConsecutive": "Tu última intervención ya es una nota de voz — espera respuesta o sigue por texto",
  "limitDaily": "Has llegado al límite diario de notas de voz",
  "unsavedWarning": "Tienes una nota de voz sin publicar",
  "stopPlayback": "Detener la reproducción",
  "backToComment": "Volver al comentario"
}
```

Uso: `t("voice.publish")` con el `useTranslations("social")` que los componentes del hilo ya tienen. No hay que tocar `RouteMessages` (el ns `social` ya viaja a todas las rutas con hilo).

- [ ] **Step 3: Stub de analítica**

`src/lib/voice/voice-note-analytics.ts` — clon del patrón `src/lib/celebrations/analytics.ts` (el repo no tiene proveedor de analítica; esto es el punto de enganche, spec §10 «observación instrumentada»):

```ts
// Eventos de las notas de voz (spec §10). El repo aún no tiene proveedor de
// analítica de producto: hoy solo trazan en dev, pero el punto de enganche
// existe para cuando lo haya (mismo criterio que celebrations/analytics.ts).
//
// REGLA DE PRIVACIDAD: sin ids de comentario ni de post, sin texto libre.
// Superficie y números, nada que identifique contenido.

export type VoiceNoteAnalyticsEvent =
  | "recording_started"
  | "recording_discarded"
  | "voice_note_published"
  | "playback_started"
  | "playback_completed"
  | "playback_rate_changed";

export type VoiceNoteAnalyticsContext = {
  /** Dónde está el hilo: página de post, club o ficha. */
  surface?: "post" | "club" | "detail";
  durationMs?: number;
  rate?: number;
};

export function logVoiceNote(
  name: VoiceNoteAnalyticsEvent,
  context: VoiceNoteAnalyticsContext = {},
): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[voice-note] ${name}`, context);
  }
  // ponytail: sin proveedor de analítica todavía. Cuando lo haya, emitir aquí.
}
```

- [ ] **Step 4: Verificar y commit**

Run: `fnm use 22; npx tsc --noEmit; npm run lint`
Expected: limpio.

```bash
git add src/components/ui/icons.tsx messages/es.json src/lib/voice/voice-note-analytics.ts
git commit -m "feat(social): iconos, copys y eventos de las notas de voz"
```

---

### Task 9: Preferencias (velocidad, escuchado) y almacén de reproducción

**Files:**
- Create: `src/lib/voice/voice-preferences.ts`
- Create: `src/lib/voice/playback-store.ts`
- Test: `src/lib/voice/voice-preferences.test.ts`, `src/lib/voice/playback-store.test.ts`

**Interfaces:**
- Consumes: `logVoiceNote` (Tarea 8).
- Produces:
  - `VOICE_RATES = [1, 1.5, 2] as const`; `readVoiceRate(): number`; `cycleVoiceRate(): number`; `useVoiceRate(): number`; `isListened(commentId): boolean`; `markListened(commentId): void`; `useListened(commentId): boolean`.
  - `createPlaybackStore(createAudio)` (para tests) y el singleton: `playVoiceNote(input: { commentId: string; url: string; durationMs: number; author: string }): void`; `togglePlayback(): void`; `stopPlayback(): void`; `seekToFraction(f: number): void`; `setChipVisible(commentId: string, visible: boolean): void`; `subscribePlayback(cb): () => void`; `getPlaybackSnapshot(): PlaybackSnapshot`; `usePlaybackSnapshot(): PlaybackSnapshot`.
  - `PlaybackSnapshot = { commentId: string | null; author: string; playing: boolean; positionMs: number; durationMs: number; chipVisible: boolean }`.

Reglas que encapsula (spec §4): un solo audio sonando a la vez (un único `HTMLAudioElement` del módulo); la velocidad se aplica al elemento y se recuerda; `ended` marca escuchado y emite `playback_completed`; `playback_started` se emite en cada play de un comentario distinto. localStorage con la doctrina del repo: `useSyncExternalStore` + `getServerSnapshot` (defaults), claves `biblioshare:voice-rate` y `biblioshare:voice-listened` (array de ids, recortado a los 500 últimos), todo `try/catch` (Safari privado).

- [ ] **Step 1: Tests (fallando)**

`src/lib/voice/voice-preferences.test.ts` (primera línea: `// @vitest-environment jsdom`):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cycleVoiceRate, isListened, markListened, readVoiceRate } from "./voice-preferences";

beforeEach(() => localStorage.clear());

describe("velocidad", () => {
  it("por defecto 1x", () => {
    expect(readVoiceRate()).toBe(1);
  });
  it("cicla 1 → 1.5 → 2 → 1 y persiste", () => {
    expect(cycleVoiceRate()).toBe(1.5);
    expect(cycleVoiceRate()).toBe(2);
    expect(cycleVoiceRate()).toBe(1);
    expect(readVoiceRate()).toBe(1);
  });
  it("valor corrupto en storage → 1x", () => {
    localStorage.setItem("biblioshare:voice-rate", "banana");
    expect(readVoiceRate()).toBe(1);
  });
});

describe("escuchado", () => {
  it("marca y recuerda por id", () => {
    expect(isListened("c1")).toBe(false);
    markListened("c1");
    expect(isListened("c1")).toBe(true);
    expect(isListened("c2")).toBe(false);
  });
  it("recorta a 500 ids", () => {
    for (let i = 0; i < 510; i++) markListened(`c${i}`);
    expect(isListened("c0")).toBe(false);
    expect(isListened("c509")).toBe(true);
  });
});
```

`src/lib/voice/playback-store.test.ts` (también `// @vitest-environment jsdom`), contra la factoría con un audio falso:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createPlaybackStore, type AudioLike } from "./playback-store";

function fakeAudio(): AudioLike & { listeners: Map<string, () => void> } {
  const listeners = new Map<string, () => void>();
  return {
    src: "",
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    listeners,
    play: vi.fn(async function (this: AudioLike) {
      (this as { paused: boolean }).paused = false;
    }),
    pause: vi.fn(function (this: AudioLike) {
      (this as { paused: boolean }).paused = true;
    }),
    addEventListener(type: string, cb: () => void) {
      listeners.set(type, cb);
    },
    removeEventListener() {},
  };
}

const nota = { commentId: "c1", url: "https://x/a?t=1", durationMs: 10_000, author: "Ana" };

describe("playback-store", () => {
  it("play carga la URL, aplica la velocidad guardada y arranca", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio, { initialRate: 1.5 });
    store.playVoiceNote(nota);
    expect(audio.src).toBe(nota.url);
    expect(audio.playbackRate).toBe(1.5);
    expect(store.getPlaybackSnapshot()).toMatchObject({ commentId: "c1", playing: true, durationMs: 10_000 });
  });

  it("play de OTRO comentario sustituye al anterior (un solo audio a la vez)", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    store.playVoiceNote({ ...nota, commentId: "c2", url: "https://x/b?t=1" });
    expect(audio.src).toBe("https://x/b?t=1");
    expect(store.getPlaybackSnapshot().commentId).toBe("c2");
  });

  it("toggle pausa y reanuda el activo", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    store.togglePlayback();
    expect(store.getPlaybackSnapshot().playing).toBe(false);
    store.togglePlayback();
    expect(store.getPlaybackSnapshot().playing).toBe(true);
  });

  it("seek por fracción mueve currentTime", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    store.seekToFraction(0.5);
    expect(audio.currentTime).toBeCloseTo(5);
  });

  it("ended limpia el activo y notifica", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    const onEnded = vi.fn();
    store.playVoiceNote(nota, { onEnded });
    audio.listeners.get("ended")!();
    expect(onEnded).toHaveBeenCalledWith("c1");
    expect(store.getPlaybackSnapshot().commentId).toBeNull();
  });
});
```

Run: `fnm use 22; npm run test -- src/lib/voice`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 2: Implementar `voice-preferences.ts`**

```ts
"use client";

// Preferencias de reproducción de notas de voz, SOLO locales (spec §2: el
// «escuchado» jamás se sincroniza ni se notifica al autor). Convención del
// repo: claves `biblioshare:*`, useSyncExternalStore con getServerSnapshot
// (la doctrina anti useState+useEffect de agenda-columns.ts:10-20) y todo
// acceso a localStorage en try/catch (Safari privado, thumbnails).

import { useSyncExternalStore } from "react";

const RATE_KEY = "biblioshare:voice-rate";
const LISTENED_KEY = "biblioshare:voice-listened";
const EVENT = "voice:preferences-change";
const LISTENED_MAX = 500;

export const VOICE_RATES = [1, 1.5, 2] as const;

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // sin window (SSR) no hay nadie escuchando
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function readVoiceRate(): number {
  try {
    const raw = Number(window.localStorage.getItem(RATE_KEY));
    return (VOICE_RATES as readonly number[]).includes(raw) ? raw : 1;
  } catch {
    return 1;
  }
}

/** 1 → 1.5 → 2 → 1. Devuelve la nueva velocidad ya persistida. */
export function cycleVoiceRate(): number {
  const current = readVoiceRate();
  const idx = (VOICE_RATES as readonly number[]).indexOf(current);
  const next = VOICE_RATES[(idx + 1) % VOICE_RATES.length]!;
  try {
    window.localStorage.setItem(RATE_KEY, String(next));
  } catch {
    // sin persistencia: la sesión actual sigue funcionando igual
  }
  emit();
  return next;
}

export function useVoiceRate(): number {
  return useSyncExternalStore(subscribe, readVoiceRate, () => 1);
}

function readListened(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LISTENED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function isListened(commentId: string): boolean {
  return readListened().includes(commentId);
}

export function markListened(commentId: string): void {
  try {
    const next = [...readListened().filter((id) => id !== commentId), commentId].slice(-LISTENED_MAX);
    window.localStorage.setItem(LISTENED_KEY, JSON.stringify(next));
  } catch {
    // igual que arriba: sin storage no hay punto de no-escuchado, y ya
  }
  emit();
}

export function useListened(commentId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isListened(commentId),
    () => true, // en servidor, sin punto: no parpadea un "no escuchado" falso
  );
}
```

- [ ] **Step 3: Implementar `playback-store.ts`**

```ts
"use client";

// Un solo audio sonando a la vez, global (spec §2): el módulo tiene UN
// HTMLAudioElement y todos los chips mandan sobre él. Los componentes leen
// por useSyncExternalStore. La factoría existe para poder testear la máquina
// con un AudioLike falso; la app usa el singleton de abajo.

import { useSyncExternalStore } from "react";
import { logVoiceNote } from "./voice-note-analytics";
import { markListened, readVoiceRate } from "./voice-preferences";

export type AudioLike = {
  src: string;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
};

export type PlaybackSnapshot = {
  commentId: string | null;
  author: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  chipVisible: boolean;
};

const EMPTY: PlaybackSnapshot = {
  commentId: null,
  author: "",
  playing: false,
  positionMs: 0,
  durationMs: 0,
  chipVisible: true,
};

type PlayInput = { commentId: string; url: string; durationMs: number; author: string };

export function createPlaybackStore(
  createAudio: () => AudioLike,
  opts?: { initialRate?: number },
) {
  let audio: AudioLike | null = null;
  let snapshot: PlaybackSnapshot = EMPTY;
  let onEndedCb: ((commentId: string) => void) | null = null;
  const subscribers = new Set<() => void>();

  function notify() {
    for (const cb of subscribers) cb();
  }
  function set(next: Partial<PlaybackSnapshot>) {
    snapshot = { ...snapshot, ...next };
    notify();
  }

  function ensureAudio(): AudioLike {
    if (audio) return audio;
    audio = createAudio();
    audio.addEventListener("timeupdate", () => {
      set({ positionMs: Math.round((audio?.currentTime ?? 0) * 1000) });
    });
    audio.addEventListener("ended", () => {
      const ended = snapshot.commentId;
      snapshot = EMPTY;
      notify();
      if (ended) onEndedCb?.(ended);
    });
    audio.addEventListener("pause", () => set({ playing: false }));
    audio.addEventListener("play", () => set({ playing: true }));
    return audio;
  }

  return {
    playVoiceNote(input: PlayInput, hooks?: { onEnded?: (commentId: string) => void }) {
      const el = ensureAudio();
      if (hooks?.onEnded) onEndedCb = hooks.onEnded;
      if (snapshot.commentId !== input.commentId) {
        el.src = input.url;
        el.currentTime = 0;
      }
      el.playbackRate = opts?.initialRate ?? readVoiceRate();
      snapshot = {
        commentId: input.commentId,
        author: input.author,
        playing: true,
        positionMs: snapshot.commentId === input.commentId ? snapshot.positionMs : 0,
        durationMs: input.durationMs,
        chipVisible: true,
      };
      notify();
      void el.play();
    },
    togglePlayback() {
      if (!audio || !snapshot.commentId) return;
      if (snapshot.playing) audio.pause();
      else void audio.play();
      set({ playing: !snapshot.playing });
    },
    stopPlayback() {
      if (audio) audio.pause();
      snapshot = EMPTY;
      notify();
    },
    seekToFraction(f: number) {
      if (!audio || !snapshot.commentId) return;
      const clamped = Math.max(0, Math.min(1, f));
      audio.currentTime = (snapshot.durationMs / 1000) * clamped;
      set({ positionMs: Math.round(snapshot.durationMs * clamped) });
    },
    applyRate(rate: number) {
      if (audio) audio.playbackRate = rate;
    },
    setChipVisible(commentId: string, visible: boolean) {
      if (snapshot.commentId !== commentId) return;
      set({ chipVisible: visible });
    },
    subscribePlayback(cb: () => void): () => void {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    getPlaybackSnapshot(): PlaybackSnapshot {
      return snapshot;
    },
  };
}

// ---- Singleton de la app -----------------------------------------------

const appStore = createPlaybackStore(() => new Audio());

/** Play (o re-play) de una nota: emite analítica y marca escuchado al acabar. */
export function playVoiceNote(input: PlayInput): void {
  logVoiceNote("playback_started", { durationMs: input.durationMs });
  appStore.playVoiceNote(input, {
    onEnded: (commentId) => {
      markListened(commentId);
      logVoiceNote("playback_completed", { durationMs: input.durationMs });
    },
  });
}

export const togglePlayback = appStore.togglePlayback;
export const stopPlayback = appStore.stopPlayback;
export const seekToFraction = appStore.seekToFraction;
export const applyPlaybackRate = appStore.applyRate;
export const setChipVisible = appStore.setChipVisible;
export const subscribePlayback = appStore.subscribePlayback;
export const getPlaybackSnapshot = appStore.getPlaybackSnapshot;

export function usePlaybackSnapshot(): PlaybackSnapshot {
  return useSyncExternalStore(subscribePlayback, getPlaybackSnapshot, () => EMPTY);
}
```

> `new Audio()` solo se ejecuta en el primer `playVoiceNote` (lazy vía `ensureAudio`)… con la línea del singleton tal cual, `createPlaybackStore` NO crea el Audio en import (solo guarda la factoría) — verificar que ninguna ruta lo importa desde un Server Component (todos los consumidores son `"use client"`).

- [ ] **Step 4: Verificar y commit**

Run: `fnm use 22; npm run test -- src/lib/voice`
Expected: PASS.

```bash
git add src/lib/voice/voice-preferences.ts src/lib/voice/voice-preferences.test.ts src/lib/voice/playback-store.ts src/lib/voice/playback-store.test.ts
git commit -m "feat(social): almacen de reproduccion con velocidad y escuchado locales"
```

---

### Task 10: El chip reproductor y su render en las tarjetas de comentario

**Files:**
- Create: `src/components/social/voice-note-chip.tsx`
- Create: `src/components/social/voice-mini-bar.tsx`
- Modify: `src/components/social/post-thread.tsx` (cuerpo del comentario, ~:275-284; montar `<VoiceMiniBar/>` junto al composer)
- Modify: `src/components/social/review-interactions.tsx` (cuerpo, ~:243-252; montar `<VoiceMiniBar/>`)

**Interfaces:**
- Consumes: `InteractionComment.audio` (Tarea 5), playback-store y preferencias (Tarea 9), `formatVoiceDuration` (Tarea 2), iconos (Tarea 8).
- Produces: `VoiceNoteChip({ commentId, author, audio }: { commentId: string; author: string; audio: { url: string; durationMs: number; peaks: number[] } })`; `VoiceMiniBar()` (sin props).

- [ ] **Step 1: Implementar `voice-note-chip.tsx`**

```tsx
"use client";

// El chip de audio (spec §4): misma tarjeta de comentario, cuerpo de UNA
// línea `[▶] waveform [0:23] [1x]`. La waveform ES la barra de progreso
// (se rellena al reproducir, tap = seek) y el elemento flexible: se comprime
// a profundidad 4; play, duración y velocidad son fijos.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { MicIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import {
  applyPlaybackRate,
  playVoiceNote,
  seekToFraction,
  setChipVisible,
  togglePlayback,
  usePlaybackSnapshot,
} from "@/lib/voice/playback-store";
import { cycleVoiceRate, useListened, useVoiceRate } from "@/lib/voice/voice-preferences";
import { logVoiceNote } from "@/lib/voice/voice-note-analytics";

const MIN_BARS = 16;

export function VoiceNoteChip({
  commentId,
  author,
  audio,
}: {
  commentId: string;
  author: string;
  audio: { url: string; durationMs: number; peaks: number[] };
}) {
  const t = useTranslations("social");
  const playback = usePlaybackSnapshot();
  const rate = useVoiceRate();
  const listened = useListened(commentId);
  const ref = useRef<HTMLDivElement>(null);

  const isActive = playback.commentId === commentId;
  const playing = isActive && playback.playing;
  const progress =
    isActive && audio.durationMs > 0 ? Math.min(1, playback.positionMs / audio.durationMs) : 0;

  // La mini-barra aparece cuando el chip ACTIVO sale del viewport.
  useEffect(() => {
    if (!isActive || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setChipVisible(commentId, entry?.isIntersecting ?? true),
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      setChipVisible(commentId, true);
    };
  }, [isActive, commentId]);

  // Sin picos persistidos (fallo del cliente al grabar): barras planas.
  const peaks = audio.peaks.length > 0 ? audio.peaks : Array.from({ length: MIN_BARS }, () => 40);

  function handlePlay() {
    if (isActive) togglePlayback();
    else playVoiceNote({ commentId, url: audio.url, durationMs: audio.durationMs, author });
  }

  function handleSeek(e: React.MouseEvent<HTMLButtonElement>) {
    if (!isActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekToFraction((e.clientX - rect.left) / rect.width);
  }

  function handleRate() {
    const next = cycleVoiceRate();
    applyPlaybackRate(next);
    logVoiceNote("playback_rate_changed", { rate: next });
  }

  return (
    <div
      ref={ref}
      data-testid="voice-note-chip"
      className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5"
    >
      <MicIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      <button
        type="button"
        aria-label={playing ? t("voice.pausePlayback") : t("voice.play")}
        onClick={handlePlay}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent hover:bg-accent/20"
      >
        {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        aria-label={t("voice.seek")}
        onClick={handleSeek}
        className="flex h-7 min-w-[72px] flex-1 items-end gap-px overflow-hidden"
      >
        {peaks.map((p, i) => (
          <span
            key={i}
            className={`w-full min-w-[2px] flex-1 rounded-sm ${
              i / peaks.length <= progress && isActive ? "bg-accent" : "bg-border"
            }`}
            style={{ height: `${Math.max(12, p)}%` }}
          />
        ))}
      </button>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatVoiceDuration(isActive ? Math.max(0, audio.durationMs - playback.positionMs) : audio.durationMs)}
      </span>
      <button
        type="button"
        aria-label={t("voice.speed")}
        onClick={handleRate}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        {rate}x
      </button>
      {!listened && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
    </div>
  );
}
```

- [ ] **Step 2: Implementar `voice-mini-bar.tsx`**

```tsx
"use client";

// Mini-barra flotante (spec §4): la reproducción sobrevive al scroll. Solo la
// PRIMERA instancia montada pinta (varias superficies con hilos pueden
// convivir en una página: club + ficha); al desmontarse la última, se detiene
// la reproducción — eso cubre «navegar a otra ruta detiene el audio» (MVP).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import { stopPlayback, togglePlayback, usePlaybackSnapshot } from "@/lib/voice/playback-store";

let instances = 0;

export function VoiceMiniBar() {
  const t = useTranslations("social");
  const s = usePlaybackSnapshot();
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    instances += 1;
    setIsFirst(instances === 1);
    return () => {
      instances -= 1;
      if (instances === 0) stopPlayback();
    };
  }, []);

  if (!isFirst || !s.commentId || s.chipVisible) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg lg:bottom-6">
      <button
        type="button"
        aria-label={s.playing ? t("voice.pausePlayback") : t("voice.play")}
        onClick={togglePlayback}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
      >
        {s.playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        aria-label={t("voice.backToComment")}
        onClick={() =>
          document.getElementById(`c-${s.commentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
      >
        {s.author}
      </button>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatVoiceDuration(s.positionMs)}/{formatVoiceDuration(s.durationMs)}
      </span>
      <button
        type="button"
        aria-label={t("voice.stopPlayback")}
        onClick={stopPlayback}
        className="shrink-0 px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Renderizar el chip en las dos tarjetas**

En `src/components/social/post-thread.tsx`, el bloque del cuerpo (~:275-284) consume `c.body` con `RichTextView` (y `SpoilerGate` si spoiler). Envolverlo:

```tsx
{comment.audio ? (
  comment.isSpoiler ? (
    <SpoilerGate>
      <VoiceNoteChip commentId={comment.id} author={comment.author} audio={comment.audio} />
    </SpoilerGate>
  ) : (
    <VoiceNoteChip commentId={comment.id} author={comment.author} audio={comment.audio} />
  )
) : (
  /* …el bloque de texto actual, SIN CAMBIOS… */
)}
```

(ajustando `comment` al nombre local de cada fichero: `node.comment` en `post-thread`, `c` en `review-interactions`). Repetir en `src/components/social/review-interactions.tsx` (~:243-252). El pie de acciones (reacciones, responder, menú ⋯) no se toca: el chip solo sustituye el cuerpo. `canEdit` ya viene `false` para audios desde la Tarea 5, así que el menú no ofrece editar.

Montar `<VoiceMiniBar />` una vez por superficie: en `post-thread.tsx` junto al `composerWrapper` (~:228-232) y en `review-interactions.tsx` al final del bloque expandido.

> `activity-chat-bubbles.tsx` (chat de actividades de club) también consume `c.body`, pero su superficie NO ofrece grabación en el MVP (spec §1: posts de club, reseñas, pensamientos) y por sus propios composers nunca entrará un audio. No se toca; si un día se comparte hilo, pintará el body vacío — asumido y registrado en la issue de cierre (Tarea 15).

- [ ] **Step 4: Verificar**

Run: `fnm use 22; npx tsc --noEmit; npm run lint; npm run test`
Expected: limpio y en verde. La verificación visual llega con el e2e (Tarea 14).

- [ ] **Step 5: Commit**

```bash
git add src/components/social/voice-note-chip.tsx src/components/social/voice-mini-bar.tsx src/components/social/post-thread.tsx src/components/social/review-interactions.tsx
git commit -m "feat(social): chip reproductor de notas de voz con mini-barra flotante"
```

---

### Task 11: La grabadora — motor `MediaRecorder` y UI inline

**Files:**
- Create: `src/lib/voice/audio-recorder.ts`
- Create: `src/components/social/voice-recorder.tsx`

**Interfaces:**
- Consumes: `resamplePeaks` (Tarea 2), constantes de límites (Tarea 2), `formatVoiceDuration` (Tarea 2), iconos (Tarea 8), `logVoiceNote` (Tarea 8).
- Produces: `VoiceRecording = { blob: Blob; mimeType: string; durationMs: number; peaks: number[] }`; `pickVoiceMimeType(): string | null`; `VoiceRecorderEngine` (`create()`, `start(onTick)`, `pause()`, `resume()`, `stop(): Promise<VoiceRecording>`, `cancel()`); `VoiceRecorder({ onPublish, onCancel, busy }: { onPublish: (rec: VoiceRecording) => void; onCancel: () => void; busy?: boolean })`.

El motor es la capa fina NO testeada en unit (browser-only, decisión alineada con cómo el repo aísla `use-optimistic-action`); toda la lógica pura ya vive en Tarea 2. El e2e (Tarea 14) lo cubre con el micro falso de Chromium.

- [ ] **Step 1: Implementar el motor**

`src/lib/voice/audio-recorder.ts`:

```ts
"use client";

// Capa fina sobre MediaRecorder + AudioContext (spec §6): graba 100 % en
// local (perder red durante la grabación no afecta), con pausa reanudable
// (MediaRecorder.pause concatena segmentos él solo) y un tick de ~100 ms que
// alimenta el timer, la waveform en vivo y las muestras de los 64 picos.

import { resamplePeaks } from "./peaks";

export type VoiceRecording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  peaks: number[];
};

export type RecorderTick = { elapsedMs: number; amplitude: number };

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus", // Chrome / Android / WebView Capacitor
  "audio/webm",
  "audio/mp4", // Safari / iOS (AAC)
];

export function pickVoiceMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export class VoiceRecorderEngine {
  private chunks: BlobPart[] = [];
  private samples: number[] = [];
  private elapsedMs = 0;
  private lastTickAt = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  private constructor(
    private stream: MediaStream,
    private recorder: MediaRecorder,
    private audioContext: AudioContext,
    private analyser: AnalyserNode,
    readonly mimeType: string,
  ) {}

  /** Pide el micro. Lanza el DOMException de getUserMedia (NotAllowedError…). */
  static async create(): Promise<VoiceRecorderEngine> {
    const mimeType = pickVoiceMimeType();
    if (!mimeType) throw new DOMException("MediaRecorder unsupported", "NotSupportedError");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType });
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    return new VoiceRecorderEngine(stream, recorder, audioContext, analyser, mimeType);
  }

  start(onTick: (tick: RecorderTick) => void): void {
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000); // timeslice: el blob crece por segundos, no al final
    this.lastTickAt = performance.now();
    const data = new Uint8Array(this.analyser.fftSize);
    this.interval = setInterval(() => {
      if (this.paused) {
        this.lastTickAt = performance.now();
        return;
      }
      const now = performance.now();
      this.elapsedMs += now - this.lastTickAt;
      this.lastTickAt = now;
      this.analyser.getByteTimeDomainData(data);
      let max = 0;
      for (const v of data) max = Math.max(max, Math.abs(v - 128));
      const amplitude = max / 128; // 0..1
      this.samples.push(amplitude);
      onTick({ elapsedMs: this.elapsedMs, amplitude });
    }, 100);
  }

  pause(): void {
    if (this.recorder.state === "recording") this.recorder.pause();
    this.paused = true;
  }

  resume(): void {
    if (this.recorder.state === "paused") this.recorder.resume();
    this.paused = false;
    this.lastTickAt = performance.now();
  }

  stop(): Promise<VoiceRecording> {
    return new Promise((resolve, reject) => {
      this.recorder.onstop = () => {
        this.release();
        resolve({
          blob: new Blob(this.chunks, { type: this.mimeType }),
          mimeType: this.mimeType,
          durationMs: Math.round(this.elapsedMs),
          peaks: resamplePeaks(this.samples),
        });
      };
      this.recorder.onerror = () => {
        this.release();
        reject(new Error("recording_failed"));
      };
      try {
        this.recorder.stop();
      } catch (e) {
        this.release();
        reject(e);
      }
    });
  }

  cancel(): void {
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // ya estaba parado
    }
    this.release();
  }

  private release(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const track of this.stream.getTracks()) track.stop();
    void this.audioContext.close().catch(() => {});
  }
}
```

> **Permiso revocado a mitad (spec §3):** cuando el usuario corta el permiso, los tracks del stream emiten `ended` y `MediaRecorder` dispara stop — el componente lo trata pasando a previsualización con lo grabado (listener `track.onended` en el Step 2).

- [ ] **Step 2: Implementar la UI**

`src/components/social/voice-recorder.tsx` — sustituye al composer mientras se graba (spec §3, wireframes):

```tsx
"use client";

// Grabadora inline (spec §3): tap mic → grabando desde ya (sin pantalla
// intermedia), pausa reanudable, cuenta atrás ámbar a los 45 s, corte a los
// 60 s que NO descarta (pasa a previsualización), y previsualización
// OBLIGATORIA con regrabar/publicar. Descartar con >15 s grabados pide
// confirmación inline (nunca window.confirm: bloquea el WebView).

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MicIcon, PauseIcon, PlayIcon, StopIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import {
  VOICE_CONFIRM_DISCARD_FROM_MS,
  VOICE_COUNTDOWN_FROM_MS,
  VOICE_MAX_DURATION_MS,
  VOICE_MIN_DURATION_MS,
} from "@/lib/voice/voice-note-limits";
import { VoiceRecorderEngine, type VoiceRecording } from "@/lib/voice/audio-recorder";
import { logVoiceNote } from "@/lib/voice/voice-note-analytics";

type Phase = "recording" | "paused" | "preview" | "denied" | "confirm-discard";

const LIVE_BARS = 24;

export function VoiceRecorder({
  onPublish,
  onCancel,
  busy = false,
}: {
  onPublish: (rec: VoiceRecording) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("social");
  const engineRef = useRef<VoiceRecorderEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("recording");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>([]);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const stoppingRef = useRef(false);

  const finishToPreview = useCallback(async () => {
    if (stoppingRef.current || !engineRef.current) return;
    stoppingRef.current = true;
    try {
      const rec = await engineRef.current.stop();
      engineRef.current = null;
      setRecording(rec);
      setPreviewUrl(URL.createObjectURL(rec.blob));
      setPhase("preview");
    } catch {
      onCancel();
    } finally {
      stoppingRef.current = false;
    }
  }, [onCancel]);

  // Arrancar al montar: el tap en el mic ya fue el gesto de inicio.
  useEffect(() => {
    let disposed = false;
    logVoiceNote("recording_started");
    VoiceRecorderEngine.create()
      .then((engine) => {
        if (disposed) {
          engine.cancel();
          return;
        }
        engineRef.current = engine;
        engine.start(({ elapsedMs: ms, amplitude }) => {
          setElapsedMs(ms);
          setLiveBars((prev) => [...prev.slice(-(LIVE_BARS - 1)), amplitude]);
          if (ms >= VOICE_MAX_DURATION_MS) void finishToPreview();
        });
      })
      .catch(() => setPhase("denied"));
    return () => {
      disposed = true;
      engineRef.current?.cancel();
      engineRef.current = null;
    };
  }, [finishToPreview]);

  // Aviso al navegar/cerrar con grabación o preview sin publicar (spec §3).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function requestDiscard(after: () => void) {
    if (elapsedMs > VOICE_CONFIRM_DISCARD_FROM_MS && phase !== "confirm-discard") {
      setPhase("confirm-discard");
      pendingDiscard.current = after;
      return;
    }
    after();
  }
  const pendingDiscard = useRef<() => void>(() => {});

  function discardAndClose() {
    logVoiceNote("recording_discarded", { durationMs: elapsedMs });
    engineRef.current?.cancel();
    engineRef.current = null;
    onCancel();
  }

  function rerecord() {
    logVoiceNote("recording_discarded", { durationMs: recording?.durationMs ?? elapsedMs });
    setRecording(null);
    setPreviewUrl(null);
    setElapsedMs(0);
    setLiveBars([]);
    setPhase("recording");
    VoiceRecorderEngine.create()
      .then((engine) => {
        engineRef.current = engine;
        engine.start(({ elapsedMs: ms, amplitude }) => {
          setElapsedMs(ms);
          setLiveBars((prev) => [...prev.slice(-(LIVE_BARS - 1)), amplitude]);
          if (ms >= VOICE_MAX_DURATION_MS) void finishToPreview();
        });
      })
      .catch(() => setPhase("denied"));
  }

  function togglePreview() {
    if (!previewUrl) return;
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(previewUrl);
      previewAudioRef.current.onended = () => setPreviewPlaying(false);
    }
    if (previewPlaying) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
    } else {
      void previewAudioRef.current.play();
      setPreviewPlaying(true);
    }
  }

  if (phase === "denied") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <span>{t("voice.micDenied")}</span>
        <button type="button" onClick={onCancel} className="shrink-0 text-accent">
          {t("cancel")}
        </button>
      </div>
    );
  }

  if (phase === "confirm-discard") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
        <span>{t("voice.confirmDiscard")}</span>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={() => pendingDiscard.current()} className="text-status-dropped">
            {t("voice.discard")}
          </button>
          <button
            type="button"
            onClick={() => setPhase(recording ? "preview" : "recording")}
            className="text-accent"
          >
            {t("voice.keep")}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "preview" && recording) {
    return (
      <div
        data-testid="voice-preview"
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
      >
        <button
          type="button"
          aria-label={previewPlaying ? t("voice.pausePlayback") : t("voice.play")}
          onClick={togglePreview}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
        >
          {previewPlaying ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
        </button>
        <div className="flex h-7 min-w-0 flex-1 items-end gap-px overflow-hidden">
          {recording.peaks.map((p, i) => (
            <span key={i} className="w-full min-w-[2px] flex-1 rounded-sm bg-border" style={{ height: `${Math.max(12, p)}%` }} />
          ))}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatVoiceDuration(recording.durationMs)}
        </span>
        <button
          type="button"
          onClick={() => requestDiscard(rerecord)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("voice.rerecord")}
        </button>
        <button
          type="button"
          data-testid="voice-publish"
          disabled={busy || recording.durationMs < VOICE_MIN_DURATION_MS}
          onClick={() => onPublish(recording)}
          className="shrink-0 text-xs font-medium text-accent disabled:opacity-50"
        >
          {t("voice.publish")}
        </button>
      </div>
    );
  }

  // recording | paused
  const remaining = VOICE_MAX_DURATION_MS - elapsedMs;
  const countdown = elapsedMs >= VOICE_COUNTDOWN_FROM_MS;
  return (
    <div
      data-testid="voice-recorder"
      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
    >
      <button
        type="button"
        aria-label={t("voice.cancel")}
        onClick={() => requestDiscard(discardAndClose)}
        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
      <span className={`h-2 w-2 shrink-0 rounded-full ${phase === "paused" ? "bg-border" : "animate-pulse bg-status-dropped"}`} aria-hidden />
      <div className="flex h-7 min-w-0 flex-1 items-end gap-px overflow-hidden" aria-label={t("voice.recording")}>
        {liveBars.map((a, i) => (
          <span key={i} className="w-full min-w-[2px] flex-1 rounded-sm bg-accent/60" style={{ height: `${Math.max(10, Math.round(a * 100))}%` }} />
        ))}
      </div>
      <span className={`shrink-0 font-mono text-[10px] ${countdown ? "text-amber-500" : "text-muted-foreground"}`}>
        {countdown ? `-${formatVoiceDuration(remaining)}` : formatVoiceDuration(elapsedMs)}
      </span>
      {phase === "paused" ? (
        <button type="button" aria-label={t("voice.resume")} onClick={() => { engineRef.current?.resume(); setPhase("recording"); }} className="shrink-0 text-accent">
          <PlayIcon className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" aria-label={t("voice.pause")} onClick={() => { engineRef.current?.pause(); setPhase("paused"); }} className="shrink-0 text-muted-foreground hover:text-foreground">
          <PauseIcon className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        data-testid="voice-stop"
        aria-label={t("voice.stop")}
        onClick={() => void finishToPreview()}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
      >
        <StopIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verificar y commit**

Run: `fnm use 22; npx tsc --noEmit; npm run lint`
Expected: limpio (este componente se prueba end-to-end en Tarea 14).

```bash
git add src/lib/voice/audio-recorder.ts src/components/social/voice-recorder.tsx
git commit -m "feat(social): grabadora inline con pausa, tope de 60s y previsualizacion obligatoria"
```

---

### Task 12: Integración en el composer — mic, frenos, envío optimista con reintento

**Files:**
- Create: `src/components/social/use-voice-note-submit.ts`
- Create: `src/components/social/pending-voice-note.tsx`
- Modify: `src/components/social/comment-composer.tsx` (prop `micSlot`)
- Modify: `src/components/social/post-thread.tsx`
- Modify: `src/components/social/review-interactions.tsx`
- Test: `src/components/social/use-voice-note-submit.test.ts`

**Interfaces:**
- Consumes: `addVoiceComment` (Tarea 6), `voiceGate` (Tarea 2), `VoiceRecorder`/`VoiceRecording` (Tarea 11), `logVoiceNote` (Tarea 8).
- Produces:
  - `CommentComposer` gana `micSlot?: React.ReactNode` — se pinta EN LUGAR del botón «Enviar» cuando el campo está vacío (spec §3: el mic vive donde Enviar; al teclear, Enviar lo sustituye).
  - `useVoiceNoteSubmit(interactionTargetId: string): { pending: PendingVoiceNote[]; publish: (rec: VoiceRecording, opts: { parentId: string | null; isSpoiler: boolean }) => void; retry: (localId: string) => void; discard: (localId: string) => void }` con `PendingVoiceNote = { localId: string; parentId: string | null; status: "uploading" | "failed"; recording: VoiceRecording }`.
  - `PendingVoiceNoteRow({ note, onRetry, onDiscard })`.

- [ ] **Step 1: Test del hook (fallando)**

`src/components/social/use-voice-note-submit.test.ts`:

```ts
// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addVoiceComment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/social/voice-note-actions", () => ({ addVoiceComment }));

import { useVoiceNoteSubmit } from "./use-voice-note-submit";

const rec = {
  blob: new Blob(["x"], { type: "audio/webm" }),
  mimeType: "audio/webm",
  durationMs: 5000,
  peaks: [10, 20],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useVoiceNoteSubmit", () => {
  it("publica: entra en pending y desaparece al ok", async () => {
    addVoiceComment.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    expect(result.current.pending).toHaveLength(1);
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    const fd = addVoiceComment.mock.calls[0]![1] as FormData;
    expect((fd.get("file") as File).type).toBe("audio/webm");
    expect(fd.get("durationMs")).toBe("5000");
    expect(JSON.parse(fd.get("peaks") as string)).toEqual([10, 20]);
  });

  it("fallo → 2 reintentos silenciosos → estado failed", async () => {
    vi.useFakeTimers();
    addVoiceComment.mockResolvedValue({ ok: false, error: "unknown" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(addVoiceComment).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
    expect(result.current.pending[0]!.status).toBe("failed");
  });

  it("los errores de freno NO se reintentan (el reintento no los va a arreglar)", async () => {
    vi.useFakeTimers();
    addVoiceComment.mockResolvedValue({ ok: false, error: "voice_thread_limit" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(addVoiceComment).toHaveBeenCalledTimes(1);
    expect(result.current.pending[0]!.status).toBe("failed");
  });

  it("retry relanza y discard elimina", async () => {
    addVoiceComment.mockResolvedValue({ ok: false, error: "voice_daily_limit" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await waitFor(() => expect(result.current.pending[0]!.status).toBe("failed"));
    addVoiceComment.mockResolvedValue({ ok: true });
    act(() => result.current.retry(result.current.pending[0]!.localId));
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
  });
});
```

(Si `@testing-library/react` no está instalada, comprobar `package.json`; los tests de componentes existentes del repo dirán qué hay — `stat-panel.test.tsx` usa jsdom. Si no hay testing-library, reescribir el test contra una versión extraída de la máquina de reintentos: `createVoiceSubmitMachine(sender)` pura en el mismo fichero del hook, y el hook la envuelve. La máquina es lo que importa cubrir.)

Run: `fnm use 22; npm run test -- src/components/social/use-voice-note-submit`
Expected: FAIL.

- [ ] **Step 2: Implementar el hook y la fila pendiente**

`src/components/social/use-voice-note-submit.ts`:

```ts
"use client";

// Publicación de una nota de voz con reintento (spec §3, errores/conexión):
// el blob vive AQUÍ, en cliente, hasta que la subida cuaja — el comentario
// «Publicando…» no es un useOptimistic (ese estado se evapora al asentarse la
// transición y el blob no puede viajar por la action de texto): es estado
// local propio. 2 reintentos automáticos silenciosos con espera creciente y
// después «No se pudo publicar · Reintentar / Descartar».

import { useCallback, useRef, useState } from "react";
import { addVoiceComment } from "@/lib/social/voice-note-actions";
import type { VoiceRecording } from "@/lib/voice/audio-recorder";
import { logVoiceNote } from "@/lib/voice/voice-note-analytics";

export type PendingVoiceNote = {
  localId: string;
  parentId: string | null;
  status: "uploading" | "failed";
  recording: VoiceRecording;
};

const RETRY_DELAYS_MS = [800, 2500];

/** Errores que el reintento no va a arreglar: a failed directamente. */
const NO_RETRY = new Set([
  "voice_thread_limit",
  "voice_consecutive",
  "voice_daily_limit",
  "not_commentable",
  "unauthenticated",
  "invalid_audio",
  "too_large",
  "invalid_duration",
]);

export function useVoiceNoteSubmit(interactionTargetId: string) {
  const [pending, setPending] = useState<PendingVoiceNote[]>([]);
  const optsRef = useRef(new Map<string, { parentId: string | null; isSpoiler: boolean }>());

  const attempt = useCallback(
    async (note: PendingVoiceNote, retriesLeft: number) => {
      const opts = optsRef.current.get(note.localId)!;
      const fd = new FormData();
      const ext = note.recording.mimeType.includes("mp4") ? "m4a" : "webm";
      fd.set("file", new File([note.recording.blob], `nota.${ext}`, { type: note.recording.mimeType }));
      fd.set("durationMs", String(note.recording.durationMs));
      fd.set("peaks", JSON.stringify(note.recording.peaks));

      let error: string | null = null;
      try {
        const res = await addVoiceComment(interactionTargetId, fd, {
          parentId: opts.parentId ?? undefined,
          isSpoiler: opts.isSpoiler,
        });
        if (res.ok) {
          logVoiceNote("voice_note_published", { durationMs: note.recording.durationMs });
          optsRef.current.delete(note.localId);
          setPending((prev) => prev.filter((p) => p.localId !== note.localId));
          return;
        }
        error = res.error;
      } catch {
        error = "network";
      }

      if (retriesLeft > 0 && !NO_RETRY.has(error)) {
        const delay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - retriesLeft] ?? 2500;
        setTimeout(() => void attempt(note, retriesLeft - 1), delay);
        return;
      }
      setPending((prev) =>
        prev.map((p) => (p.localId === note.localId ? { ...p, status: "failed" } : p)),
      );
    },
    [interactionTargetId],
  );

  const publish = useCallback(
    (recording: VoiceRecording, opts: { parentId: string | null; isSpoiler: boolean }) => {
      const localId = `voice-${crypto.randomUUID()}`;
      optsRef.current.set(localId, opts);
      const note: PendingVoiceNote = { localId, parentId: opts.parentId, status: "uploading", recording };
      setPending((prev) => [...prev, note]);
      void attempt(note, RETRY_DELAYS_MS.length);
    },
    [attempt],
  );

  const retry = useCallback(
    (localId: string) => {
      setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: "uploading" } : p)));
      const note = pending.find((p) => p.localId === localId);
      if (note) void attempt({ ...note, status: "uploading" }, 0);
    },
    [attempt, pending],
  );

  const discard = useCallback((localId: string) => {
    optsRef.current.delete(localId);
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  return { pending, publish, retry, discard };
}
```

`src/components/social/pending-voice-note.tsx`:

```tsx
"use client";

// La fila «Publicando…» / «No se pudo publicar · Reintentar / Descartar» de
// una nota de voz en vuelo (spec §3). Waveform atenuada con los picos que ya
// tenemos; no es un reproductor.

import { useTranslations } from "next-intl";
import { formatVoiceDuration } from "@/lib/voice/format";
import type { PendingVoiceNote } from "./use-voice-note-submit";

export function PendingVoiceNoteRow({
  note,
  onRetry,
  onDiscard,
}: {
  note: PendingVoiceNote;
  onRetry: (localId: string) => void;
  onDiscard: (localId: string) => void;
}) {
  const t = useTranslations("social");
  return (
    <div
      data-testid="voice-pending"
      className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-2.5 py-1.5 opacity-80"
    >
      <div className="flex h-6 min-w-0 flex-1 items-end gap-px overflow-hidden">
        {note.recording.peaks.map((p, i) => (
          <span key={i} className="w-full min-w-[2px] flex-1 rounded-sm bg-border" style={{ height: `${Math.max(12, p)}%` }} />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatVoiceDuration(note.recording.durationMs)}
      </span>
      {note.status === "uploading" ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">{t("voice.publishing")}</span>
      ) : (
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="text-status-dropped">{t("voice.uploadFailed")}</span>
          <button type="button" onClick={() => onRetry(note.localId)} className="font-medium text-accent">
            {t("voice.retry")}
          </button>
          <button type="button" onClick={() => onDiscard(note.localId)} className="text-muted-foreground">
            {t("voice.discard")}
          </button>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `micSlot` en el composer**

En `src/components/social/comment-composer.tsx`: añadir la prop `micSlot?: React.ReactNode` y, en la zona de botones (`:175-183`), pintar el mic EN LUGAR de «Enviar» con el campo vacío:

```tsx
          {micSlot && !value.trim() ? (
            micSlot
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || !value.trim()}
              className={`shrink-0 text-xs font-medium text-accent disabled:opacity-50${compact ? " px-1 py-1" : ""}`}
            >
              {submitLabel}
            </button>
          )}
```

- [ ] **Step 4: Cablear `post-thread.tsx`**

1. Estado nuevo: `const [voiceMode, setVoiceMode] = useState(false);` y `const voice = useVoiceNoteSubmit(interactionTargetId);`.
2. Gate del cliente (los pendientes cuentan como audios propios para no pasarse publicando en ráfaga):

```ts
  const gate = voiceGate([
    ...state.comments.map((c) => ({ isOwn: c.isOwn, hasAudio: c.audio != null, createdAt: c.createdAt })),
    ...voice.pending.map(() => ({ isOwn: true, hasAudio: true, createdAt: "9999" })),
  ]);
```

3. El botón mic (con tooltip de primera vez, clave localStorage `biblioshare:voice-tooltip-seen` leída/escrita en try/catch al estilo de `voice-preferences`):

```tsx
  const micButton = viewerLoggedIn ? (
    <span className="relative shrink-0">
      <button
        type="button"
        data-testid="voice-mic"
        aria-label={t("voice.record")}
        title={gate.allowed ? undefined : t(gate.reason === "thread_limit" ? "voice.limitThread" : "voice.limitConsecutive")}
        disabled={!gate.allowed}
        onClick={() => setVoiceMode(true)}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
      >
        <MicIcon className="h-4 w-4" />
      </button>
      {/* tooltip primera vez: burbuja absoluta, se marca vista al tocar el mic o al cerrarla */}
    </span>
  ) : undefined;
```

4. El bloque `composer` (`:190-227`) pasa a: `{voiceMode ? <VoiceRecorder onCancel={() => setVoiceMode(false)} onPublish={(rec) => { voice.publish(rec, { parentId: replyingTo?.id ?? null, isSpoiler: replyingTo ? false : spoiler }); setVoiceMode(false); }} /> : <CommentComposer …props actuales… micSlot={micButton} />}`.
   ⚠️ El efecto de auto-focus de `:102-113` hace `document.querySelector("#reply-composer textarea")` — con la grabadora montada no hay textarea: proteger con `?.` (ya lo hace) y no romper.
5. Render de pendientes: junto al final de la lista de comentarios (raíz) —

```tsx
  {voice.pending.map((note) => (
    <PendingVoiceNoteRow key={note.localId} note={note} onRetry={voice.retry} onDiscard={voice.discard} />
  ))}
```

6. `<VoiceMiniBar />` ya montada (Tarea 10).

- [ ] **Step 5: Cablear `review-interactions.tsx`**

Mismo patrón con sus dos composers (raíz `:402-417` y respuesta `:381-397`; el de EDICIÓN no lleva mic): un solo `useVoiceNoteSubmit` + `voiceMode: "root" | commentId | null` para saber qué composer está grabando; el publish de respuesta pasa `parentId: rootId` (aplanado, igual que `submitReply`). Pendientes de raíz al final de la lista; pendientes de respuesta bajo su hilo.

- [ ] **Step 6: Verificar**

Run: `fnm use 22; npm run test -- src/components/social; npx tsc --noEmit; npm run lint`
Expected: PASS/limpio.

- [ ] **Step 7: Commit**

```bash
git add src/components/social
git commit -m "feat(social): el composer graba notas de voz con frenos y reintento de subida"
```

---

### Task 13: Android — permisos del WebView

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

La pasarela de permisos ya la resuelve Capacitor (`BridgeWebChromeClient` pide `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` en runtime cuando `getUserMedia` los reclama); **sin la declaración en el manifest el launcher falla y el deny es permanente**. No hay que tocar `MainActivity` ni instalar plugin.

- [ ] **Step 1: Añadir los permisos**

Junto a los `<uses-permission>` existentes (INTERNET, CAMERA, POST_NOTIFICATIONS…):

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

- [ ] **Step 2: Commit (y verificación diferida)**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat(social): el wrapper Android declara RECORD_AUDIO para las notas de voz"
```

Verificación real solo posible en dispositivo/emulador (el `server.url` del config apunta a producción). Registrarlo en la issue de cierre (Tarea 15): probar grabación en el APK y en Safari iOS real antes de dar la superficie nativa por hecha (riesgo asumido de la spec §11).

---

### Task 14: e2e Playwright con micro falso + verificación

**Files:**
- Modify: `playwright.config.ts` (flags de media fake en chromium)
- Create: `e2e/notas-de-voz.spec.ts`

**Interfaces:**
- Consumes: toda la feature; patrón de login de `e2e/posts.spec.ts:3-7` (usuario fijo `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`).

- [ ] **Step 1: Flags de audio falso**

En `playwright.config.ts`, proyecto `chromium`:

```ts
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"],
        launchOptions: {
          // Micro falso: getUserMedia entrega un tono sin diálogo de permiso.
          // Inocuo para el resto de specs (solo afecta si piden media).
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
```

- [ ] **Step 2: El spec**

`e2e/notas-de-voz.spec.ts` — mismo esqueleto de login/creación que `e2e/posts.spec.ts` (copiar sus helpers de login y de crear un pensamiento; abajo, lo específico de voz):

```ts
import { expect, test } from "@playwright/test";

// Login + crear pensamiento: copiar el patrón exacto de posts.spec.ts
// (TEST_USER_EMAIL / TEST_USER_PASSWORD, serviceWorkers: "block").

test.use({ serviceWorkers: "block" });

test("grabar, previsualizar y publicar una nota de voz en un post", async ({ page }) => {
  // …login y navegar a la página /post/<id> de un pensamiento propio…

  // Grabar: el mic está donde estaría «Enviar» con el campo vacío.
  await page.getByTestId("voice-mic").click();
  await expect(page.getByTestId("voice-recorder")).toBeVisible();
  await page.waitForTimeout(3000); // >2 s de mínimo, el micro falso emite un tono
  await page.getByTestId("voice-stop").click();

  // Previsualización obligatoria: nada se publica sin pasar por aquí.
  await expect(page.getByTestId("voice-preview")).toBeVisible();
  await page.getByTestId("voice-publish").click();

  // El chip aparece (optimista) y sobrevive a la recarga (fila real + URL firmada).
  await expect(page.getByTestId("voice-note-chip")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("voice-note-chip")).toBeVisible();

  // Y reproduce: el tiempo restante cambia al darle a play.
  const chip = page.getByTestId("voice-note-chip");
  const before = await chip.locator("span.font-mono").innerText();
  await chip.getByRole("button").first().click();
  await expect(async () => {
    expect(await chip.locator("span.font-mono").innerText()).not.toBe(before);
  }).toPass({ timeout: 5000 });
});

test("tras publicar, el mic queda atenuado hasta que alguien responda (freno consecutivo)", async ({ page }) => {
  // …en el MISMO post del test anterior (el último comentario es mi audio)…
  await expect(page.getByTestId("voice-mic")).toBeDisabled();
  // y el texto sigue funcionando:
  // …escribir un comentario de texto y enviarlo (patrón de posts.spec.ts)…
  // tras el texto propio, el mic se reactiva:
  await expect(page.getByTestId("voice-mic")).toBeEnabled();
});
```

(Completar los `…` con los helpers reales de `posts.spec.ts` al implementar; son ~20 líneas de login + creación que ya existen escritas allí.)

- [ ] **Step 3: Correr el spec**

Run: con `next dev` en el 3000 (reutilizar el que haya): `fnm use 22; npm run test:e2e -- notas-de-voz`
Expected: 2 passed.

- [ ] **Step 4: Suite completa y build**

Run: `fnm use 22; npm run test; npm run build`
Expected: unit en verde; build limpio (no hay `use cache` nuevo, pero el build valida server actions y client boundaries).

- [ ] **Step 5: Verificación visual (qa-verifier)**

Lanzar el agente `qa-verifier` sobre el flujo: grabar en un pensamiento, chip en el hilo, velocidad 1x→1.5x persistida tras recargar, mini-barra al hacer scroll con audio sonando, spoiler-audio tras `SpoilerGate`, reporte de un comentario de audio desde el menú ⋯.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/notas-de-voz.spec.ts
git commit -m "test(social): e2e de notas de voz con microfono falso de chromium"
```

---

### Task 15: Cierre — prod, documentación e issues

**Files:**
- Modify: `docs/requirements/data-model.md` (delta nuevo + fecha de verificación)
- Modify: `docs/DRIFT-CHECK.md` (tabla de referencia de la superficie 6)
- Modify: `docs/requirements/decisiones.md` (entrada al FINAL, append-only)
- Modify: `docs/requirements/backlog.md` / `docs/PROYECTO.md` (feature hecha)

- [ ] **Step 1: Migración a prod**

Solo con las Tareas 1-14 verificadas: `mcp__supabase-prod__apply_migration` con el MISMO SQL de `20260878_comments_voice_notes.sql`; repetir la verificación de objetos reales y la superficie 6 del DRIFT-CHECK contra prod (mismas queries de la Tarea 1, Steps 3-4).

- [ ] **Step 2: data-model.md**

Añadir un delta datado 2026-08-26 a la sección de `comments` (el bloque de deltas existente está en `:948-977`): las 3 columnas, el CHECK texto-XOR-audio, el bucket privado `voice-notes` (sin policies: solo service-role), la decisión de NO dar `grant update` a las columnas de audio (inmutables), y el snapshot de reporte con `audio_path`. Actualizar la fecha de verificación de la cabecera.

- [ ] **Step 3: DRIFT-CHECK.md**

En la superficie 6, actualizar la tabla de referencia con la fila de `comments` (12 columnas, INSERT completo, UPDATE en 3) y la fecha.

- [ ] **Step 4: decisiones.md (append al final)**

Entrada nueva: nota de voz = comentario (3 columnas, no tabla); bucket privado + URL firmada 1 h (primer uso de `createSignedUrls` del repo); frenos en server action y no en trigger (a diferencia del tope de reacciones — la action es la única vía de escritura y los frenos consultan agregados por usuario); audio inmutable (sin grant update); path `<user_id>/<uuid>.<ext>` en vez del `<comment_id>` de la spec (el id no existe antes del insert y la secuencia manda subir primero).

- [ ] **Step 5: backlog / PROYECTO**

Lanzar el agente `backlog-scribe` para reflejar la feature como hecha donde toque (no había entrada previa en el backlog: nació de spec directa).

- [ ] **Step 6: Issues (el pendiente vive como issue, sin excepciones)**

```sh
gh issue create --label "area:social,tipo:feature,P3" --title "Transcripcion automatica de notas de voz (fase 2)" --body-file <borrador>
gh issue create --label "area:social,tipo:deuda,P2" --title "Notas de voz sin alternativa accesible ni moderacion escalable hasta la transcripcion" --body-file <borrador>
gh issue create --label "area:social,tipo:cobertura,P2" --title "Probar notas de voz en APK Android y Safari iOS reales" --body-file <borrador>
```

Cuerpos: citar spec §5/§8/§11 (la transcripción desbloquea accesibilidad+moderación+búsqueda; moderador escucha a mano — límite asumido; AAC/mp4 en Safari sin probar en hardware real; `activity-chat-bubbles` pintaría body vacío si un día comparte hilos con audio).

- [ ] **Step 7: Commit final**

```bash
git add docs
git commit -m "docs(social): data-model, drift-check y decisiones de las notas de voz"
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de la spec:** §3 grabadora (T11), pausa/45s/60s/preview/cancelar (T11), errores y reintento (T12), permiso denegado/revocado (T11), aviso al salir (T11); §4 chip/velocidad/un-solo-audio/mini-barra/escuchado local (T9-T10), frenos (T2 cliente + T6 servidor); §6 datos/bucket/subida/borrado (T1, T4, T6, T7); §7 límites servidor (T6); §8 reporte con snapshot útil (T1), bloqueos gratis vía RLS+firma (T4-T5); §10 eventos (T8, cableados en T9/T11/T12); tooltip primera vez (T12). Fuera a propósito (spec §9): transcripción, audio+caption, auto-avance, edición de audio, notificación especial — la notificación usa la ruta normal con copy de voz (T3), que es lo que la spec llama «llega la normal de comentó».
- **Consistencia de nombres verificada:** `voiceGate`/`VoiceGateComment` (T2→T6/T12), `signVoiceNoteUrls` (T4→T5), `addVoiceComment` (T6→T12), `VoiceRecording` (T11→T12), `usePlaybackSnapshot`/`setChipVisible` (T9→T10), claves `social.voice.*` (T8→T10/T11/T12).
- **Trampas del repo incorporadas:** CHECK `comments_body_canonical` (T1), grants por columna #375 (T1/T15), snapshot de reporte (T1), Storage solo service-role (T4/T6), `notifyMentions`/`commentContext` dependen del texto (T3/T6), `deleteComment` sin `.select` (T7), doctrina `useSyncExternalStore` (T9), providers de `RouteMessages` reemplazan (T8: todo bajo `social`), export de `"use server"` = action (T2: gate extraído a módulo aparte).



