# Confirmar y desmarcar un hito de lectura conjunta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que marcar un hito exija dos pulsaciones deliberadas y que se pueda desmarcar, arrastrando los posteriores.

**Architecture:** Una RPC nueva, espejo de `confirm_checkpoint`, que borra las filas del llamante desde el hito pulsado en adelante; el mismo fichero de migración corrige de paso el orden de gates de la función vieja. En la interfaz, el botón se convierte en su propia pregunta de confirmación, sin diálogo, y el texto del aviso al desmarcar lo calcula una función pura que vive aparte porque es la única parte con reglas.

**Tech Stack:** Next.js (App Router, client components), TypeScript, Supabase (Postgres + RLS + RPC), next-intl, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-12-hitos-confirmar-y-desmarcar-design.md`

## Global Constraints

- **En una RPC sobre estas tablas, el gate de permiso va PRIMERO.** Comprobar existencia antes que permiso revela si un uuid existe a quien no participa. Es la fuga que `20260831_club_activity_role_gate_first.sql` (issue #129) corrigió en cuatro RPC y que reapareció esta semana en `update_activity_details`. Con el gate primero, un id inexistente deja el `activity_id` nulo, `is_activity_participant(null)` da `false` y también cae en `forbidden`.
- **Migraciones: dev primero.** Producción la decide el usuario. «No aparece en `list_migrations`» ≠ «no está en prod»: verificar contra `pg_proc`.
- **Antes de añadir una clave a `messages/es.json`, comprobar que el nombre no está cogido.** `JSON.parse` no avisa de duplicados (se queda con el último) y ya provocó una regresión en una rama hermana.
- **Un fichero `"use client"` exporta componentes, no utilidades que llame también el servidor.** Eso provocó un 500 (#595). Lo compartido va a un módulo sin directiva.
- **Los comentarios llegan con tope de 20** (`COMMENT_PREFETCH_LIMIT` en `src/lib/social/interactions.ts`), mientras `commentCount` es el total real. Nunca afirmar un número de mensajes propios calculado sobre la lista recortada.
- Un solo locale: `messages/es.json`. Nada de texto literal en JSX.
- Comentarios en castellano explicando el porqué. No pasar prettier: el repo no tiene config y formatear genera cientos de líneas de ruido.
- Node: el shell arranca con v20 y rompe vitest. `fnm use 22` antes de `npm test`; confirmar con `node --version`.
- Un solo `next dev`, en el puerto 3000. `npm run test:e2e` reutiliza el que haya.

---

### Task 1: La RPC `unconfirm_checkpoint`, y el gate de la vieja

**Files:**
- Create: `supabase/migrations/20260855_unconfirm_checkpoint.sql`

**Interfaces:**
- Produces: `public.unconfirm_checkpoint(p_checkpoint_id uuid) returns void`, códigos `forbidden` y `not_found`. La consume Task 3.
- Modifica: `public.confirm_checkpoint(uuid)` — solo el ORDEN de sus comprobaciones y la normalización de un código de error.

- [ ] **Step 1: Confirmar el número libre y leer la función viva**

```bash
ls supabase/migrations | tail -3
```
Expected: la última es `20260854_update_activity_details.sql`. Si hay algo posterior, usar el siguiente libre y ajustar el nombre en todos los pasos.

Y lee la definición vigente de `confirm_checkpoint`, que es la que vas a reordenar:

```bash
sed -n '17,50p' supabase/migrations/20260827_hitos_autodeclarados.sql
```

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/20260855_unconfirm_checkpoint.sql`:

```sql
-- Desmarcar un hito de lectura conjunta, y el gate de confirm_checkpoint
-- (spec 2026-08-12).
--
-- POR QUÉ UNA RPC: `club_activity_checkpoint_reads` no tiene política de
-- escritura de cliente, a propósito (20260713_activity_checkpoints.sql). No hay
-- ningún camino de borrado, así que desmarcar exige función, no un `delete`
-- expuesto.
--
-- LA CASCADA VA HACIA DELANTE, simétrica a la de confirmar: confirmar el hito N
-- auto-confirma 1..N, así que desmarcar el N desmarca N..último. El invariante
-- es que el progreso de cada participante sea un tramo CONTINUO desde el
-- principio -- «voy por el hito 3» es lo único que significa algo en una
-- lectura. Permitir huecos daría estados sin sentido («he llegado al 5 pero no
-- al 2») que además no cambiarían ningún número, porque el tablero de grupo mide
-- por el hito más alto alcanzado.
--
-- NO comprueba el estado de la actividad, igual que confirm_checkpoint. La
-- asimetría sería peor que la permisividad: si puedes marcar en una actividad
-- finalizada, tienes que poder desmarcar.
create or replace function public.unconfirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
begin
  select activity_id, "order" into v_activity_id, v_order
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  -- Gate PRIMERO (#129, migración 20260831). Con un id que no existe,
  -- v_activity_id es null y is_activity_participant(null) da false, así que
  -- quien pregunta recibe `forbidden` y no aprende si ese hito existe.
  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  -- Guarda defensiva: con el gate delante es inalcanzable, igual que en las
  -- cuatro funciones que arregló 20260831. Se conserva por coherencia con ellas.
  if v_activity_id is null then
    raise exception 'not_found';
  end if;

  -- Solo TUS filas: r.user_id = auth.uid(). Idempotente -- desmarcar dos veces
  -- seguidas no falla, la segunda borra cero filas.
  delete from public.club_activity_checkpoint_reads r
   using public.club_activity_checkpoints c
   where r.checkpoint_id = c.id
     and c.activity_id = v_activity_id
     and c."order" >= v_order
     and r.user_id = auth.uid();
end;
$$;

comment on function public.unconfirm_checkpoint(uuid) is
  'Deshace la declaración de haber llegado a un hito, y a los posteriores (spec 2026-08-12). Simétrica a confirm_checkpoint, que auto-confirma 1..N: el progreso de cada participante es siempre un tramo continuo desde el principio. Solo borra filas del llamante. Exige ser participante; no mira el estado de la actividad, igual que su gemela.';

revoke execute on function public.unconfirm_checkpoint(uuid) from public, anon;
grant execute on function public.unconfirm_checkpoint(uuid) to authenticated;


-- ── confirm_checkpoint: el gate de participante pasa a ir PRIMERO ────────────
-- Comprobaba `not found` ANTES que el permiso, así que revelaba si un uuid de
-- hito existe a quien no participa en la actividad. Es la misma fuga de INFO que
-- 20260831_club_activity_role_gate_first.sql (issue #129) corrigió en cuatro RPC
-- de club_activities. El cuerpo (la cascada 1..N) NO cambia: solo el orden de las
-- comprobaciones, y el código 'not found' se normaliza a 'not_found' para que
-- las dos gemelas hablen igual.
create or replace function public.confirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
begin
  select activity_id, "order" into v_activity_id, v_order
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  if v_activity_id is null then
    raise exception 'not_found';
  end if;

  -- Confirmar el checkpoint N auto-confirma 1..N (idempotente) -- evita que quien
  -- salta directo a un checkpoint tardío se quede sin fila en los anteriores.
  insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id)
  select id, auth.uid()
    from public.club_activity_checkpoints
    where activity_id = v_activity_id and "order" <= v_order
  on conflict (checkpoint_id, user_id) do nothing;
end;
$$;
```

- [ ] **Step 3: Comprobar que nadie dependía del texto `'not found'`**

```bash
grep -rn "not found" src/ e2e/ | grep -i "checkpoint\|hito"
```
Expected: sin salida. `confirmCheckpoint` en `checkpoints.ts` relanza el error y `checkpoint-list.tsx` lo traduce a un mensaje genérico, así que el cambio de texto no rompe nada. **Si aparece alguna coincidencia, para y repórtalo** en vez de cambiar el código que la usa.

- [ ] **Step 4: Aplicar en DEV**

Con `mcp__supabase-dev__apply_migration`, nombre `unconfirm_checkpoint`, el contenido del fichero.

**Si las herramientas MCP de Supabase no están disponibles**, existe una vía alternativa documentada: el conector `mcp__claude_ai_Supabase__*` con `project_id` explícito — **dev es `tyvzpuhxfwxrnkcpzxyg`**. Si tampoco está, deja el fichero committeado, dilo en el informe y marca los pasos de verificación como no ejecutados. No inventes una tercera vía.

- [ ] **Step 5: Verificar los objetos y sus permisos**

```sql
select p.proname, p.prosecdef, p.proconfig,
       (select string_agg(pg_get_userbyid(e.grantee) || '=' || e.privilege_type, ', ')
          from aclexplode(p.proacl) e) as permisos
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('unconfirm_checkpoint','confirm_checkpoint');
```
Expected: las dos con `prosecdef = true`, `proconfig = {search_path=public, pg_temp}`, y `authenticated` en permisos **sin `anon`**.

- [ ] **Step 6: Probar el comportamiento contra dev**

Siembra en `begin; … rollback;` en UNA sola llamada y confirma después con un SELECT que no queda basura. Simula sesión con `set_config('request.jwt.claim.sub', '<uuid>', true)`.

Casos, y los dos primeros son los que justifican el arreglo del gate:

- **No participante + hito existente** → `forbidden`.
- **No participante + uuid de hito inexistente** → `forbidden`. **Los dos deben dar el MISMO código**: si el segundo diera `not_found`, la fuga sigue. Pruébalo contra las DOS funciones, `unconfirm_checkpoint` y `confirm_checkpoint`.
- Participante con los hitos 1–5 confirmados desmarca el 3 → le quedan **1 y 2**.
- Desmarcar dos veces seguidas el mismo hito → la segunda no falla.
- **Con dos participantes confirmados, desmarcar uno NO toca las filas del otro.** Es lo que prueba el `r.user_id = auth.uid()`.
- Camino feliz de `confirm_checkpoint` tras el reorden: un participante confirma el hito 3 y aparecen las filas 1, 2 y 3. El arreglo no debía cambiar esto, y hay que verlo.

Si algún caso da otro código, **para y repórtalo**: el orden de los gates es parte del diseño.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260855_unconfirm_checkpoint.sql
git commit -m "feat(db): desmarcar un hito, y el gate de confirm_checkpoint primero"
```

---

### Task 2: Qué cae al desmarcar (función pura)

**Files:**
- Create: `src/lib/clubs/activities/unconfirm-impact.ts`
- Test: `src/lib/clubs/activities/unconfirm-impact.test.ts`

**Interfaces:**
- Consumes: `CheckpointViewModel` de `./checkpoints`.
- Produces:
  ```ts
  export type UnconfirmImpact = {
    /** Etiquetas de los hitos posteriores que caen, como mucho DOS. */
    alsoFalling: string[];
    /** Cuántos caen además de los nombrados. 0 si no hay recorte. */
    extraCount: number;
    /** null = el aviso del chat no aplica. { count: n } = n mensajes tuyos.
     *  { count: null } = aplica, pero no se puede afirmar un número. */
    chat: { count: number | null } | null;
  };
  export function unconfirmImpact(
    target: CheckpointViewModel,
    all: CheckpointViewModel[],
  ): UnconfirmImpact;
  ```
  La consume Task 4.

- [ ] **Step 1: Escribir el test que falla**

`src/lib/clubs/activities/unconfirm-impact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { unconfirmImpact } from "./unconfirm-impact";
import type { CheckpointViewModel } from "./checkpoints";
import type { InteractionSummary, InteractionComment } from "@/lib/social/interactions";

function comment(isOwn: boolean): InteractionComment {
  return {
    id: "c", interactionTargetId: "t", authorId: "a", author: "A",
    authorUsername: null, authorAvatarUrl: null, initials: "A",
    body: "hola", createdAt: "2026-08-01", isOwn, canDelete: isOwn, canEdit: isOwn,
  };
}

function chat(comments: InteractionComment[], total = comments.length): InteractionSummary {
  return {
    interactionTargetId: "t", reactionCount: 0, viewerReacted: false,
    commentCount: total, comments, reactions: {} as InteractionSummary["reactions"],
  };
}

function cp(over: Partial<CheckpointViewModel> & { order: number }): CheckpointViewModel {
  return {
    id: `id-${over.order}`, label: `Hito ${over.order}`, position: {} as CheckpointViewModel["position"],
    dueOn: null, status: "confirmed", reachedByCount: 1, participantCount: 2, chat: null,
    ...over,
  };
}

const cinco = [cp({ order: 0 }), cp({ order: 1 }), cp({ order: 2 }), cp({ order: 3 }), cp({ order: 4 })];

describe("unconfirmImpact — qué arrastra desmarcar", () => {
  it("el último hito no arrastra a nadie", () => {
    const impacto = unconfirmImpact(cinco[4], cinco);
    expect(impacto.alsoFalling).toEqual([]);
    expect(impacto.extraCount).toBe(0);
  });

  it("arrastra solo a los POSTERIORES, nunca a los anteriores", () => {
    const impacto = unconfirmImpact(cinco[3], cinco);
    expect(impacto.alsoFalling).toEqual(["Hito 4"]);
    expect(impacto.extraCount).toBe(0);
  });

  it("con más de dos posteriores, nombra dos y cuenta el resto", () => {
    const impacto = unconfirmImpact(cinco[0], cinco);
    expect(impacto.alsoFalling).toEqual(["Hito 1", "Hito 2"]);
    expect(impacto.extraCount).toBe(2);
  });

  it("los hitos ya pendientes no cuentan como que caen", () => {
    const mixto = [
      cp({ order: 0 }),
      cp({ order: 1 }),
      cp({ order: 2, status: "pending" }),
      cp({ order: 3, status: "pending" }),
    ];
    const impacto = unconfirmImpact(mixto[1], mixto);
    expect(impacto.alsoFalling).toEqual([]);
    expect(impacto.extraCount).toBe(0);
  });
});

describe("unconfirmImpact — el aviso del chat", () => {
  it("sin chat cargado, no aplica", () => {
    expect(unconfirmImpact(cp({ order: 0 }), [cp({ order: 0 })]).chat).toBeNull();
  });

  it("chat sin mensajes tuyos y sin recorte: no aplica", () => {
    const c = cp({ order: 0, chat: chat([comment(false), comment(false)]) });
    expect(unconfirmImpact(c, [c]).chat).toBeNull();
  });

  it("chat con mensajes tuyos y sin recorte: aplica CON número", () => {
    const c = cp({ order: 0, chat: chat([comment(true), comment(false), comment(true)]) });
    expect(unconfirmImpact(c, [c]).chat).toEqual({ count: 2 });
  });

  it("con recorte y mensajes tuyos visibles: aplica SIN número", () => {
    // 20 cargados de 50 reales: contar los tuyos sobre los 20 mentiría.
    const c = cp({ order: 0, chat: chat([comment(true), ...Array(19).fill(comment(false))], 50) });
    expect(unconfirmImpact(c, [c]).chat).toEqual({ count: null });
  });

  it("con recorte y NINGÚN mensaje tuyo visible: aplica igual, sin número", () => {
    // No se puede descartar que haya alguno tuyo entre los 30 que no llegaron.
    const c = cp({ order: 0, chat: chat(Array(20).fill(comment(false)), 50) });
    expect(unconfirmImpact(c, [c]).chat).toEqual({ count: null });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- src/lib/clubs/activities/unconfirm-impact.test.ts`
Expected: FAIL — `Failed to resolve import "./unconfirm-impact"`.

- [ ] **Step 3: Implementar**

```ts
import type { CheckpointViewModel } from "./checkpoints";

// Qué arrastra desmarcar un hito, para poder decirlo ANTES de hacerlo.
//
// Vive aparte de la tarjeta porque es la única parte con reglas de todo el
// cambio, y la única que se puede probar sin navegador.

/** Cuántos hitos posteriores se nombran antes de pasar a contarlos. Dos caben en
 *  el ancho de una fila; desmarcar el primero de una lectura con diez, no. */
const MAX_NOMBRADOS = 2;

export type UnconfirmImpact = {
  /** Etiquetas de los hitos posteriores que caen, como mucho MAX_NOMBRADOS. */
  alsoFalling: string[];
  /** Cuántos caen además de los nombrados. 0 si no hay recorte. */
  extraCount: number;
  /**
   * null = el aviso del chat no aplica.
   * { count: n } = tienes n mensajes ahí, y n es exacto.
   * { count: null } = aplica, pero afirmar un número sería mentir.
   */
  chat: { count: number | null } | null;
};

export function unconfirmImpact(
  target: CheckpointViewModel,
  all: CheckpointViewModel[],
): UnconfirmImpact {
  // Solo los CONFIRMADOS posteriores: uno que ya estaba pendiente no "cae",
  // seguirá exactamente igual.
  const posteriores = all
    .filter((c) => c.order > target.order && c.status === "confirmed")
    .sort((a, b) => a.order - b.order);

  return {
    alsoFalling: posteriores.slice(0, MAX_NOMBRADOS).map((c) => c.label),
    extraCount: Math.max(posteriores.length - MAX_NOMBRADOS, 0),
    chat: chatImpact(target),
  };
}

// El chat solo se avisa si escribiste ahí -- perder de vista una conversación en
// la que participaste es lo que duele; una que nunca tocaste, no.
//
// La trampa: `comments` llega con tope (COMMENT_PREFETCH_LIMIT = 20) y
// `commentCount` es el total real. En un chat recortado, contar los tuyos sobre
// lo cargado da MENOS de los que hay, y ni siquiera se puede descartar que
// tengas alguno entre los que no llegaron. Así que cuando hay recorte se avisa
// sin número: un número que resulta falso gasta más confianza de la que ahorra
// al ser exacto.
function chatImpact(target: CheckpointViewModel): { count: number | null } | null {
  const chat = target.chat;
  if (!chat) return null;

  const recortado = chat.comments.length < chat.commentCount;
  if (recortado) return { count: null };

  const propios = chat.comments.filter((c) => c.isOwn).length;
  return propios > 0 ? { count: propios } : null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- src/lib/clubs/activities/unconfirm-impact.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/unconfirm-impact.ts src/lib/clubs/activities/unconfirm-impact.test.ts
git commit -m "feat(hitos): calcular qué arrastra desmarcar un hito"
```

---

### Task 3: La acción y los textos

**Files:**
- Modify: `src/lib/clubs/activities/checkpoints.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: la RPC de Task 1.
- Produces: `unconfirmCheckpoint(checkpointId: string): Promise<void>` y las claves de traducción. Los consume Task 4.

- [ ] **Step 1: Añadir la acción**

En `src/lib/clubs/activities/checkpoints.ts`, justo debajo de `confirmCheckpoint`:

```ts
// Deshace la declaración de haber llegado, y la de los hitos posteriores (spec
// 2026-08-12). Lanza como su gemela `confirmCheckpoint`: quien la llama traduce
// el fallo a un mensaje genérico, sin distinguir códigos.
export async function unconfirmCheckpoint(checkpointId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("unconfirm_checkpoint", { p_checkpoint_id: checkpointId });
  if (error) throw error;
  revalidateClubPages();
}
```

- [ ] **Step 2: Añadir la entrada de tipos a mano**

**NO regeneres `src/lib/supabase/database.types.ts` entero.** Lleva parches a mano deliberados que el generador borra, y regenerarlo ya rompió el typecheck en una rama hermana. Añade solo, en su sitio alfabético dentro de `Functions`:

```ts
      unconfirm_checkpoint: {
        Args: { p_checkpoint_id: string }
        Returns: undefined
      }
```

- [ ] **Step 3: Comprobar que las claves nuevas no están cogidas**

```bash
node -e "const a=require('./messages/es.json').activity; ['confirmCheckpointAsk','unconfirmCheckpoint','unconfirmAsk','unconfirmAlsoFalling','unconfirmAlsoFallingMore','unconfirmChat','unconfirmChatCount','unconfirmCheckpointError','askYes','askNo'].forEach(k=>console.log(k, k in a ? 'YA EXISTE' : 'libre'))"
```
Expected: las diez `libre`. Si alguna existe, **para y dilo**: reutilizar un nombre con otro significado rompe la pantalla que ya lo usaba.

`confirmCheckpoint` («Ya llegué aquí»), `confirmCheckpointError` y `chatOpen` **ya existen** y se reutilizan tal cual.

- [ ] **Step 4: Añadir las claves**

Dentro del objeto `activity`:

```json
"confirmCheckpointAsk": "¿Seguro?",
"askYes": "Sí",
"askNo": "No",
"unconfirmCheckpoint": "Desmarcar",
"unconfirmAsk": "¿Seguro?",
"unconfirmAlsoFalling": "Caen también {labels}.",
"unconfirmAlsoFallingMore": "Caen también {labels} y {count} más.",
"unconfirmChat": "Dejarás de ver su chat; tus mensajes se quedan.",
"unconfirmChatCount": "Dejarás de ver su chat; tus {count} mensajes se quedan.",
"unconfirmCheckpointError": "No se pudo desmarcar el hito. Inténtalo de nuevo.",
```

Verifica que el JSON sigue siendo válido:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/checkpoints.ts src/lib/supabase/database.types.ts messages/es.json
git commit -m "feat(hitos): acción de desmarcar y textos de la confirmación"
```

---

### Task 4: El botón que se pregunta a sí mismo

**Files:**
- Modify: `src/components/clubs/checkpoints/checkpoint-list.tsx`

**Interfaces:**
- Consumes: `unconfirmCheckpoint` (Task 3), `unconfirmImpact` (Task 2), las claves (Task 3).

- [ ] **Step 1: Añadir el estado y los manejadores**

En `CheckpointList`, junto al `error`/`isPending` que ya hay:

```tsx
  // Qué hito tiene su pregunta abierta, y para qué. Uno como mucho: abrir la de
  // un hito cierra cualquier otra, para no dejar dos preguntas a la vez en la
  // misma lista.
  const [asking, setAsking] = useState<{ id: string; action: "confirm" | "unconfirm" } | null>(null);
```

Y el manejador de desmarcar, hermano del `handleConfirm` que ya existe:

```tsx
  function handleUnconfirm(checkpointId: string) {
    setError(null);
    setAsking(null);
    startTransition(async () => {
      try {
        await unconfirmCheckpoint(checkpointId);
        onChanged();
      } catch {
        setError(t("unconfirmCheckpointError"));
      }
    });
  }
```

Y `handleConfirm` cierra también la pregunta: añade `setAsking(null);` junto a su `setError(null);`.

Imports nuevos:

```tsx
import { confirmCheckpoint, unconfirmCheckpoint, type CheckpointViewModel } from "@/lib/clubs/activities/checkpoints";
import { unconfirmImpact } from "@/lib/clubs/activities/unconfirm-impact";
```

- [ ] **Step 2: Sustituir el bloque de acciones de cada hito**

El bloque actual (el ternario `confirmed ? <span chatOpen> : viewerIsParticipant ? <Button> : <LockIcon>`) pasa a:

```tsx
                {confirmed && viewerIsParticipant ? (
                  asking?.id === c.id && asking.action === "unconfirm" ? (
                    <Ask
                      message={unconfirmMessage(c)}
                      onYes={() => handleUnconfirm(c.id)}
                      onNo={() => setAsking(null)}
                      disabled={isPending}
                      t={t}
                    />
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-green">{t("chatOpen")}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        disabled={isPending}
                        onClick={() => setAsking({ id: c.id, action: "unconfirm" })}
                      >
                        {t("unconfirmCheckpoint")}
                      </Button>
                    </div>
                  )
                ) : confirmed ? (
                  <span className="shrink-0 font-mono text-[10px] text-green">{t("chatOpen")}</span>
                ) : viewerIsParticipant ? (
                  asking?.id === c.id && asking.action === "confirm" ? (
                    <Ask
                      message={t("confirmCheckpointAsk")}
                      onYes={() => handleConfirm(c.id)}
                      onNo={() => setAsking(null)}
                      disabled={isPending}
                      t={t}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 px-3.5 py-1.5 text-xs"
                      disabled={isPending}
                      onClick={() => setAsking({ id: c.id, action: "confirm" })}
                    >
                      {t("confirmCheckpoint")}
                    </Button>
                  )
                ) : (
                  <LockIcon
                    aria-label={t("checkpointStatus_locked")}
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                )}
```

**Ojo:** la rama `confirmed && !viewerIsParticipant` conserva el `chatOpen` a secas. Un no participante no puede desmarcar nada — la RPC se lo rechazaría — así que no se le ofrece el botón.

- [ ] **Step 3: Escribir el mensaje del desmarcado y el subcomponente `Ask`**

Al final del fichero, fuera del componente:

```tsx
// La pregunta en el sitio: el botón se convierte en su propia confirmación, sin
// abrir un diálogo encima. Dos pulsaciones deliberadas -- marcar un hito es
// autodeclarativo desde #471 y ya no hay ninguna comprobación de página que
// respalde el gesto, así que un clic accidental te declara donde no estás.
function Ask({
  message,
  onYes,
  onNo,
  disabled,
  t,
}: {
  message: string;
  onYes: () => void;
  onNo: () => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations<"activity">>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="max-w-[220px] text-right text-[11px] text-muted-foreground">
        {message}
      </span>
      <Button type="button" className="px-3 py-1 text-xs" disabled={disabled} onClick={onYes}>
        {t("askYes")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-1 text-xs"
        disabled={disabled}
        onClick={onNo}
      >
        {t("askNo")}
      </Button>
    </div>
  );
}
```

Y dentro del componente, junto a los demás cálculos por hito, la función que arma el texto:

```tsx
  // El aviso nombra SOLO lo que aplica: los posteriores si los hay, el chat si
  // escribiste en él. Un aviso que no aplica enseña a ignorar los avisos.
  function unconfirmMessage(c: CheckpointViewModel): string {
    const impacto = unconfirmImpact(c, checkpoints);
    const partes = [t("unconfirmAsk")];

    if (impacto.alsoFalling.length > 0) {
      const labels = impacto.alsoFalling.join(", ");
      partes.push(
        impacto.extraCount > 0
          ? t("unconfirmAlsoFallingMore", { labels, count: impacto.extraCount })
          : t("unconfirmAlsoFalling", { labels }),
      );
    }

    if (impacto.chat) {
      partes.push(
        impacto.chat.count !== null
          ? t("unconfirmChatCount", { count: impacto.chat.count })
          : t("unconfirmChat"),
      );
    }

    return partes.join(" ");
  }
```

**Si el tipo de `t` en las props de `Ask` no compila**, no pelees con la firma genérica de next-intl: pasa las dos etiquetas ya traducidas como props (`yesLabel`, `noLabel`) desde el componente padre y quita `t` de `Ask`. Es más simple y evita un tipo prestado.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Comprobarlo en el navegador, contra build de producción**

```bash
npm run build && npm start
```

Abre una lectura conjunta activa en la que participes y comprueba: una sola pulsación en «Ya llegué aquí» **no** marca nada; la segunda sí. Desmarcar un hito intermedio avisa de los posteriores y, al aceptar, desaparecen. Un hito sin posteriores y sin comentarios tuyos pregunta a secas.

Si no puedes autenticarte, **dilo en el informe** en vez de darlo por bueno.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/checkpoints/checkpoint-list.tsx
git commit -m "feat(hitos): confirmar en dos pasos y poder desmarcar"
```

---

### Task 5: e2e

**Files:**
- Create: `e2e/club-hitos-confirmar-desmarcar.spec.ts`

- [ ] **Step 1: Copiar el arranque de sesión de un spec existente**

Run: `sed -n '1,60p' e2e/club-editar-actividad.spec.ts`

Copia de ahí el patrón de login y de siembra/limpieza por REST. **No inventes fixtures.** Necesitas una `buddy_read` activa, con ítem en el pool, varios hitos, y que el usuario de prueba sea **participante** (no basta con ser miembro: confirmar exige participar).

- [ ] **Step 2: Escribir el spec**

Tres comprobaciones:

```ts
test("una sola pulsación no marca el hito: hace falta confirmar", async ({ page }) => {
  await page.goto(`/club/${CLUB_SLUG}/actividad/${ACTIVITY_ID}`);

  await page.getByRole("button", { name: "Ya llegué aquí" }).first().click();
  // Aparece la pregunta, y el hito NO se ha marcado todavía.
  await expect(page.getByRole("button", { name: "Sí" })).toBeVisible();
  await expect(page.getByText("Chat abierto")).toHaveCount(0);

  await page.getByRole("button", { name: "No" }).click();
  await expect(page.getByRole("button", { name: "Ya llegué aquí" }).first()).toBeVisible();
});

test("confirmar marca el hito y abre su chat", async ({ page }) => {
  await page.goto(`/club/${CLUB_SLUG}/actividad/${ACTIVITY_ID}`);
  await page.getByRole("button", { name: "Ya llegué aquí" }).first().click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Chat abierto").first()).toBeVisible();
});

test("desmarcar un hito arrastra a los posteriores", async ({ page }) => {
  // Parte de tres hitos confirmados (sembrados en beforeAll o confirmados aquí).
  await page.goto(`/club/${CLUB_SLUG}/actividad/${ACTIVITY_ID}`);

  await page.getByRole("button", { name: "Desmarcar" }).first().click();
  await page.getByRole("button", { name: "Sí" }).click();

  // El primero se desmarca y con él caen los dos siguientes: no queda ninguno.
  await expect(page.getByText("Chat abierto")).toHaveCount(0);
});
```

Ajusta `CLUB_SLUG`, `ACTIVITY_ID` y los textos a lo que use la suite de verdad. El tercer test necesita saber el orden de los hitos: `.first()` es el de menor `order` porque la lista se pinta ordenada.

- [ ] **Step 3: Correr los e2e**

Run: `npm run test:e2e -- e2e/club-hitos-confirmar-desmarcar.spec.ts`
Expected: PASS.

Reutiliza el `next dev` del puerto 3000 si lo hay. **Si el cambio movió módulos, arranca el servidor DESPUÉS del último commit**: un bundle viejo en caché da resultados sin significado.

Si algún test falla, **no toques código de producto para que pase**: reporta el error literal y tu diagnóstico de si le falla al test o a la pantalla.

- [ ] **Step 4: Commit**

```bash
git add e2e/club-hitos-confirmar-desmarcar.spec.ts
git commit -m "test(e2e): confirmar en dos pasos y desmarcar en cascada"
```

---

### Task 6: Docs

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: `data-model.md`**

Documentar `unconfirm_checkpoint(uuid)`: qué borra (solo filas del llamante, desde el hito pulsado en adelante), su gate (participante, comprobado PRIMERO), que no mira el estado de la actividad y por qué, y sus dos códigos.

Y **actualizar la entrada de `confirm_checkpoint`**: su gate pasa a ir primero y su código `'not found'` se normaliza a `'not_found'`. Decir que el cambio es de orden, no de efecto: la cascada 1..N no varía.

Actualizar la fecha de verificación de la cabecera, y decir en qué entornos está aplicada.

- [ ] **Step 2: `decisiones.md`**

**Al final** (append-only), dos entradas:

- Por qué desmarcar arrastra a los posteriores: el progreso de cada participante es un tramo continuo desde el principio; permitir huecos daría estados sin sentido que además no cambian ningún número.
- Por qué el arreglo del gate de `confirm_checkpoint` entra en esta spec sin haberse pedido: dejar las dos funciones gemelas con criterios opuestos garantiza que la siguiente persona copie la equivocada.

- [ ] **Step 3: Abrir issue de lo que queda fuera**

Con las tres etiquetas en el mismo comando:

```sh
gh issue create --label "area:clubes,tipo:deuda,P3" \
  --title "El progreso del grupo retrocede sin explicación cuando alguien desmarca un hito" \
  --body "…"
```

En el cuerpo: `groupSafeOrder` es el mínimo, entre participantes, del máximo alcanzado. Si alguien desmarca, esa línea baja **para todos**, y los demás ven moverse hacia atrás el «todo el grupo ha llegado hasta X» sin que ellos hayan hecho nada. Es correcto —era verdad y deja de serlo— pero desconcertante. Salida posible: decir en el tablero quién movió qué.

- [ ] **Step 4: Producción**

**Solo cuando el usuario lo pida.** Aplicar `20260855_unconfirm_checkpoint.sql` en prod y verificar contra `pg_proc`, nunca contra el ledger: las dos funciones con `prosecdef = true` y `authenticated` sin `anon`. **Ojo con esta migración en concreto: reemplaza una función viva y muy usada (`confirm_checkpoint`)**, así que después hay que comprobar también su camino feliz, no solo que exista.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/
git commit -m "docs: sincronizar data-model y decisiones con desmarcar hitos"
```

---

## Notas de revisión del plan

Repasado contra la spec: cubiertas §2 D1 y D5 (Task 1), D2 (Task 4), D3 y §4.1 (Tasks 2 y 4), D4 (Task 2), §3 (Task 1), §5 (todas), §6 (Tasks 1, 2, 5 y 6).

Tres puntos donde el implementador debe mirar el código y no fiarse del plan, marcados en su paso:

1. **Task 4, Step 3** — el tipo de `t` prestado a `Ask`. Si no compila, pasar las etiquetas ya traducidas en vez de pelear con la firma genérica de next-intl.
2. **Task 1, Step 3** — comprobar que nadie dependía del texto `'not found'` antes de normalizarlo.
3. **Task 5, Step 1** — el usuario de prueba tiene que ser PARTICIPANTE, no solo miembro del club; confirmar exige participar.
