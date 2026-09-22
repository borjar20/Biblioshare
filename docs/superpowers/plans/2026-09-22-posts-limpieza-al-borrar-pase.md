# Posts de hito: limpieza al borrar su fuente y borrado manual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un post de hito desaparezca cuando se borra el pase, la sesión o el episodio del que salió, y que el autor pueda borrar a mano cualquier post suyo desde su tarjeta.

**Architecture:** Un trigger `after delete` en `passes`, `progress_sessions` y `episode_watches` borra los `posts` de esa fuente (`private.cleanup_source_posts`). El borrado del post dispara la limpieza social que ya existe (`posts_cleanup_social_target`). En la UI, un hook + menú compartidos (`useDeletePost` / `PostDeleteMenu`) sustituyen al menú propio de `ThoughtCard` y se montan en las tarjetas de hito, reseña y avance. En `/post/[id]`, borrar redirige a Inicio.

**Tech Stack:** Postgres (Supabase) · Next.js 16 App Router (server actions) · next-intl · Vitest + Testing Library (jsdom) · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-posts-limpieza-al-borrar-pase-design.md`

## Global Constraints

- Node 22 obligatorio. En PowerShell, en el MISMO comando: `fnm env | Out-String | Invoke-Expression; fnm use 22; <comando>`. Con v20, vitest muere con `node:util no exporta styleText`.
- `.env.local` tiene que estar en el worktree (cópialo del repo padre si falta). Sin él, los e2e se auto-saltan y salen verdes sin probar nada.
- Migraciones: **dev primero** (`tyvzpuhxfwxrnkcpzxyg`), luego prod (`vmutcradmodhiltuohys`). Los MCP `supabase-dev` y `supabase-prod` pueden no conectar; en ese caso se usa el conector de claude.ai (`mcp__b0c96efb-8b92-4246-8098-f990a5e68414__execute_sql` / `apply_migration`) con `project_id` explícito. **`apply_migration` en prod solo con autorización explícita del usuario en el chat.**
- El post se borra con su fuente **aunque tenga comentarios o reacciones ajenas**. Los pensamientos (`source_id` null) no se tocan.
- El trigger filtra siempre por `author_id = old.user_id`.
- Textos de UI en español, en `messages/es.json` (único locale).
- Commits en español, terminando en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Un solo `next dev`, en el 3000; para los e2e se arranca a mano (el webServer de Playwright agota los 120 s, #1073) y se mata al acabar.

## File Structure

| Fichero | Qué es |
|---|---|
| `supabase/migrations/20260922120000_posts_cleanup_on_source_delete.sql` (nuevo) | función `private.cleanup_source_posts` + 3 triggers |
| `supabase/migrations/20260922120100_posts_orphans_backfill.sql` (nuevo) | borrado único de huérfanos ya existentes |
| `src/components/social/post-delete-menu.tsx` (nuevo) | `useDeletePost`, `PostDeleteMenu`, `PostDeleteError` |
| `src/components/social/post-delete-menu.test.tsx` (nuevo) | Vitest jsdom del hook + menú |
| `src/components/social/thought-card.tsx` | pasa a usar el menú compartido |
| `src/components/social/milestone-card.tsx` | monta el menú |
| `src/components/social/review-card.tsx` | monta el menú |
| `src/components/social/progress-timeline-card.tsx` | monta el menú (solo singleton de post) |
| `messages/es.json` | claves `feed.post*`, fuera `feed.thoughtMenu/Delete/DeleteConfirm/DeleteError`; textos de `passes.deleteConfirm` e `item.unfollowConfirm` |
| `e2e/posts.spec.ts` | dos tests nuevos |
| `docs/requirements/data-model.md`, `docs/requirements/decisiones.md` | doc canónica |

---

### Task 1: Trigger de limpieza de posts al borrar su fuente (dev)

**Files:**
- Create: `supabase/migrations/20260922120000_posts_cleanup_on_source_delete.sql`
- Modify: `docs/requirements/data-model.md` (§5.1 `posts`, líneas ~1737-1761, y la cabecera de verificación)
- Modify: `docs/requirements/decisiones.md` (entrada nueva AL FINAL)

**Interfaces:**
- Produces: función `private.cleanup_source_posts()` (trigger, arg `tg_argv[0]` = valor de `public.post_source_kind`) y triggers `passes_cleanup_source_posts`, `progress_sessions_cleanup_source_posts` y `episode_watches_cleanup_source_posts`.

- [ ] **Step 1: Escribe la prueba SQL (tiene que fallar antes de la migración)**

Guárdala en el scratchpad como `posts-cleanup-test.sql`. Es un bloque `DO` que prepara datos, borra como `authenticated` y **siempre** termina en excepción: `ALL_OK` si todo pasó (y la excepción revierte los datos) o `FAIL: …` en la primera aserción rota.

```sql
do $$
declare
  a uuid; b uuid; bk uuid; p1 uuid; s1 uuid;
  post_fin uuid; post_start uuid; post_prog uuid; post_intruso uuid; post_thought uuid;
  tgt uuid; n int;
begin
  select user_id into a from public.profiles order by created_at limit 1;
  select user_id into b from public.profiles where user_id <> a order by created_at limit 1;
  insert into public.books(title) values ('SQLTEST cleanup ' || now()) returning id into bk;

  insert into public.passes(user_id,item_type,item_id,status,is_active,is_public,position,started_on,finished_on)
    values (a,'book',bk,'completed',true,true,'{}','2026-09-01','2026-09-02') returning id into p1;
  insert into public.progress_sessions(pass_id,user_id,duration_minutes) values (p1,a,10) returning id into s1;

  insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id)
    values (a,'finished','book',bk,'pass',p1) returning id into post_fin;
  insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id)
    values (a,'started','book',bk,'pass',p1) returning id into post_start;
  insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id)
    values (a,'progressed','book',bk,'progress_session',s1) returning id into post_prog;
  -- B cuelga un post suyo del pase de A: debe SOBREVIVIR.
  insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id)
    values (b,'finished','book',bk,'pass',p1) returning id into post_intruso;
  insert into public.posts(author_id,kind,anchor_type,anchor_id,body)
    values (a,'thought','book',bk,'pensamiento sin fuente') returning id into post_thought;

  -- Comentario ajeno en el post finished: tiene que irse con él.
  select id into tgt from public.interaction_targets where kind='post' and source_id=post_fin;
  insert into public.comments(author_id,interaction_target_id,body) values (b,tgt,'comentario ajeno');

  -- Borrado como el propio usuario A (cliente de sesión).
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.passes where id = p1;
  execute 'reset role';

  select count(*) into n from public.posts where id in (post_fin, post_start, post_prog);
  if n <> 0 then raise exception 'FAIL: quedan % posts de la fuente borrada', n; end if;
  if not exists (select 1 from public.posts where id = post_intruso) then
    raise exception 'FAIL: se borró el post de B colgado del pase de A'; end if;
  if not exists (select 1 from public.posts where id = post_thought) then
    raise exception 'FAIL: se borró un pensamiento sin fuente'; end if;
  if exists (select 1 from public.interaction_targets where id = tgt) then
    raise exception 'FAIL: sobrevivió el interaction_target del post borrado'; end if;
  if exists (select 1 from public.comments where interaction_target_id = tgt) then
    raise exception 'FAIL: sobrevivieron los comentarios del post borrado'; end if;

  raise exception 'ALL_OK';
end $$;
```

- [ ] **Step 2: Ejecútala en dev para ver que falla**

`execute_sql` con `project_id: "tyvzpuhxfwxrnkcpzxyg"` y el contenido del fichero.
Esperado: error `FAIL: quedan 3 posts de la fuente borrada`.
Si falla por otra cosa (una columna NOT NULL que falta, una cuota, que haya un solo perfil en dev), **ajusta la preparación de datos, no las aserciones**, y repite hasta ver ese FAIL.

- [ ] **Step 3: Escribe la migración**

`supabase/migrations/20260922120000_posts_cleanup_on_source_delete.sql`:

```sql
-- Un post de hito es una afirmación sobre su fuente (pase, sesión, visionado de
-- episodio). Si la fuente se borra, la afirmación es falsa: el post se va con
-- ella, con su hilo (posts_cleanup_social_target se lleva target, comentarios,
-- reacciones y avisos). Revisa la regla de la spec de posts 2026-08-09 §5
-- («borrar la fuente no cascadea»); ver decisiones.md 2026-09-22 y la spec
-- 2026-09-22-posts-limpieza-al-borrar-pase-design.md.
--
-- `author_id = old.user_id` es defensa: source_kind/source_id los escribe el
-- cliente al insertar, así que alguien puede colgar un post suyo de un pase
-- AJENO. Sin el filtro, borrar tu pase borraría el post de un tercero.
--
-- Los triggers de fila también saltan en las cascadas: borrar un pase borra sus
-- progress_sessions (FK on delete cascade) y con ellas sus posts `progressed`.
create or replace function private.cleanup_source_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.posts p
  where p.source_kind = tg_argv[0]::public.post_source_kind
    and p.source_id = old.id
    and p.author_id = old.user_id;
  return old;
end;
$function$;

revoke execute on function private.cleanup_source_posts() from public, anon, authenticated;

create trigger passes_cleanup_source_posts
  after delete on public.passes
  for each row execute function private.cleanup_source_posts('pass');

create trigger progress_sessions_cleanup_source_posts
  after delete on public.progress_sessions
  for each row execute function private.cleanup_source_posts('progress_session');

create trigger episode_watches_cleanup_source_posts
  after delete on public.episode_watches
  for each row execute function private.cleanup_source_posts('episode_watch');
```

- [ ] **Step 4: Aplícala en dev**

`apply_migration` con `project_id: "tyvzpuhxfwxrnkcpzxyg"`, `name: "posts_cleanup_on_source_delete"` y el SQL de arriba.
Verifícala contra los objetos reales, no contra el ledger:

```sql
select tgname, tgrelid::regclass from pg_trigger where tgname like '%cleanup_source_posts';
select proname, prosecdef, proacl from pg_proc where proname = 'cleanup_source_posts';
```

Esperado: 3 triggers (`passes`, `progress_sessions`, `episode_watches`), `prosecdef = true`, y en `proacl` sin `anon` ni `authenticated`.

- [ ] **Step 5: Vuelve a ejecutar la prueba SQL**

Esperado: error `ALL_OK`. Cualquier `FAIL: …` es un bug de la migración; corrígelo y vuelve al Step 4.

- [ ] **Step 6: Actualiza la doc canónica**

En `docs/requirements/data-model.md` §5.1, sustituye la frase
«La **acción real** (`passes`/`progress_sessions`/`episode_watches`) sigue siendo la fuente de verdad; `posts` la **referencia** y representa lo que se muestra socialmente.»
por:

```markdown
La **acción real** (`passes`/`progress_sessions`/`episode_watches`) sigue siendo la fuente de
verdad; `posts` la **referencia** y representa lo que se muestra socialmente. **Un post con fuente
muere con ella** (2026-09-22): `private.cleanup_source_posts(source_kind)` (`security definer`,
sin `execute` para `anon`/`authenticated`), disparada `after delete` por
`passes_cleanup_source_posts`, `progress_sessions_cleanup_source_posts` y
`episode_watches_cleanup_source_posts`, borra los posts de esa fuente **del mismo autor**
(`author_id = old.user_id`: un post colgado de una fuente ajena sobrevive). Salta también en
cascada (pase → sesiones → sus `progressed`). Se lleva el hilo aunque tenga comentarios ajenos.
Los `thought` no tienen fuente y no les afecta. Límite: los audios de comentarios de un post
borrado así quedan en Storage (#845). Migración `20260922120000_posts_cleanup_on_source_delete.sql`.
```

Añade debajo de la cabecera de frescura del fichero una línea de delta:
`> **Delta 2026-09-22:** triggers `*_cleanup_source_posts` verificados en dev (pg_trigger/pg_proc + prueba SQL con rollback).`

Añade al FINAL de `docs/requirements/decisiones.md`:

```markdown
## 2026-09-22 — Un post de hito muere con su fuente

**Qué se decide.** Borrar un pase, una sesión o un visionado de episodio borra los posts que
salieron de él (`started`, `finished`, `dropped`, `progressed`, `watched`), con su hilo, aunque
tenga comentarios de otras personas. Lo hace un trigger en BD, no las server actions.

**Qué revisa.** La spec de posts (2026-08-09, §5) decidió lo contrario: «borrar la fuente no
cascadea al post». El argumento era que el post es la representación social y tiene hilo propio.
En la práctica, marcar «Terminado» por error y borrar el pase dejaba en el feed una afirmación
falsa que no había forma de retirar (la tarjeta de hito no tenía «Eliminar»). Un hito no es
contenido del usuario como una reseña: es un reflejo de un hecho, y si el hecho no existe, el
reflejo tampoco.

**Por qué en BD.** Cubre todos los caminos que borran pases (ficha, quitar de biblioteca, deshacer
importación y los que vengan). Es la lección de #824: si cada llamador tiene que acordarse, alguno
se olvida.

**Lo que no cubre.** Deshacer un estado sin borrar el pase (Terminado→Leyendo) deja el post: el
pase sigue existiendo (issue aparte). Y los audios de comentarios quedan en Storage (#845). Para
todo lo demás, cualquier post propio se puede borrar a mano desde su tarjeta.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260922120000_posts_cleanup_on_source_delete.sql docs/requirements/data-model.md docs/requirements/decisiones.md
git commit -m "feat(posts): los posts de hito se borran con su pase, sesion o episodio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Medir los huérfanos existentes y preparar su limpieza

**Files:**
- Create: `supabase/migrations/20260922120100_posts_orphans_backfill.sql`

**Interfaces:**
- Consumes: nada de código. Es independiente de la Task 1 (no necesita el trigger).
- Produces: la tabla de medición (dev y prod) que va al cuerpo de la PR.

- [ ] **Step 1: Mide en dev y en prod (solo lectura)**

Ejecuta esto con `execute_sql` en `tyvzpuhxfwxrnkcpzxyg` (dev) y en `vmutcradmodhiltuohys` (prod):

```sql
with orphans as (
  select p.id, p.author_id, p.source_kind
  from public.posts p
  where (p.source_kind = 'pass'             and not exists (select 1 from public.passes s            where s.id = p.source_id))
     or (p.source_kind = 'progress_session' and not exists (select 1 from public.progress_sessions s where s.id = p.source_id))
     or (p.source_kind = 'episode_watch'    and not exists (select 1 from public.episode_watches s   where s.id = p.source_id))
)
select o.source_kind,
       count(*) as huerfanos,
       count(*) filter (where exists (
         select 1 from public.interaction_targets t
         join public.comments c on c.interaction_target_id = t.id
         where t.kind = 'post' and t.source_id = o.id and c.author_id <> o.author_id
       )) as con_comentario_ajeno,
       count(*) filter (where exists (
         select 1 from public.interaction_targets t
         join public.reactions r on r.interaction_target_id = t.id
         where t.kind = 'post' and t.source_id = o.id and r.user_id <> o.author_id
       )) as con_reaccion_ajena
from orphans o
group by o.source_kind
order by o.source_kind;
```

Apunta el resultado en una tabla markdown (entorno × source_kind × huérfanos × con_comentario_ajeno × con_reaccion_ajena). Va al cuerpo de la PR.

- [ ] **Step 2: Escribe la migración de limpieza**

`supabase/migrations/20260922120100_posts_orphans_backfill.sql`:

```sql
-- Limpieza ÚNICA de los posts cuya fuente ya se borró antes de que existiera
-- private.cleanup_source_posts (20260922120000). Misma regla que el trigger:
-- un post con fuente muere con ella. Recuento medido antes de aplicar (dev y
-- prod) en la PR; spec 2026-09-22-posts-limpieza-al-borrar-pase-design.md §4.3.
-- posts_cleanup_social_target se lleva el hilo de cada post borrado.
delete from public.posts p
where p.source_kind = 'pass'
  and not exists (select 1 from public.passes s where s.id = p.source_id);

delete from public.posts p
where p.source_kind = 'progress_session'
  and not exists (select 1 from public.progress_sessions s where s.id = p.source_id);

delete from public.posts p
where p.source_kind = 'episode_watch'
  and not exists (select 1 from public.episode_watches s where s.id = p.source_id);
```

- [ ] **Step 3: Aplícala en dev y vuelve a medir**

`apply_migration` en dev (`name: "posts_orphans_backfill"`). Repite la consulta del Step 1 en dev.
Esperado: cero filas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922120100_posts_orphans_backfill.sql
git commit -m "chore(posts): limpieza unica de posts cuya fuente ya no existe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**NO la apliques en prod en esta task.** Eso se hace en la Task 6, con la medición a la vista y la autorización del usuario.

---

### Task 3: Hook y menú compartidos para borrar un post

**Files:**
- Create: `src/components/social/post-delete-menu.tsx`
- Create: `src/components/social/post-delete-menu.test.tsx`
- Modify: `src/components/social/thought-card.tsx`
- Modify: `messages/es.json` (bloque `feed`, líneas ~560-563)

**Interfaces:**
- Consumes: `deletePost(postId: string): Promise<{ ok: true } | { ok: false; error: string }>` de `@/lib/social/post-actions`, y `ActionMenu` de `@/components/ui/action-menu`.
- Produces:
  - `useDeletePost(postId: string | null | undefined): { deleted: boolean; error: boolean; pending: boolean; requestDelete: () => void }`
  - `PostDeleteMenu({ onDelete, pending }: { onDelete: () => void; pending: boolean })`: pinta un «⋯» con aria-label `feed.postMenu` («Opciones») y un único menuitem `feed.postDelete` («Eliminar»).
  - `PostDeleteError()`: pinta `<p role="alert">` con `feed.postDeleteError`.
  - Claves i18n `feed.postMenu`, `feed.postDelete`, `feed.postDeleteConfirm` y `feed.postDeleteError`.

- [ ] **Step 1: Escribe el test que falla**

`src/components/social/post-delete-menu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => replace(...args) }),
  usePathname: () => pathname,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
const deletePost = vi.fn();
vi.mock("@/lib/social/post-actions", () => ({
  deletePost: (...args: unknown[]) => deletePost(...args),
}));

import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";

function Harness({ postId }: { postId: string | null }) {
  const { deleted, error, pending, requestDelete } = useDeletePost(postId);
  if (deleted) return <p>tarjeta oculta</p>;
  return (
    <div>
      <PostDeleteMenu onDelete={requestDelete} pending={pending} />
      {error && <PostDeleteError />}
    </div>
  );
}

function clickDelete() {
  fireEvent.click(screen.getByRole("button", { name: "postMenu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "postDelete" }));
}

beforeEach(() => {
  pathname = "/";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockReset();
  deletePost.mockReset();
});

describe("useDeletePost + PostDeleteMenu", () => {
  it("cancelar el confirm no llama a deletePost", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness postId="p1" />);
    clickDelete();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("confirmar borra y oculta la tarjeta solo tras ok:true", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePost.mockResolvedValue({ ok: true });
    render(<Harness postId="p1" />);
    clickDelete();
    expect(deletePost).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(screen.getByText("tarjeta oculta")).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("si falla, la tarjeta se queda y avisa en línea", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePost.mockResolvedValue({ ok: false, error: "not_allowed_or_missing" });
    render(<Harness postId="p1" />);
    clickDelete();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("postDeleteError"));
    expect(screen.queryByText("tarjeta oculta")).toBeNull();
  });

  it("en /post/[id] del propio post redirige a Inicio en vez de ocultar", async () => {
    pathname = "/post/p1";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePost.mockResolvedValue({ ok: true });
    render(<Harness postId="p1" />);
    clickDelete();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("sin postId no pregunta ni borra", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<Harness postId={null} />);
    clickDelete();
    expect(confirm).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecútalo para ver que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/social/post-delete-menu.test.tsx`
Esperado: FAIL, «Failed to resolve import "./post-delete-menu"».

- [ ] **Step 3: Implementa**

`src/components/social/post-delete-menu.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ActionMenu } from "@/components/ui/action-menu";
import { deletePost } from "@/lib/social/post-actions";

// Borrar un post propio desde CUALQUIER tarjeta (pensamiento, hito, reseña,
// avance). Nació en ThoughtCard y se extrajo al darle «Eliminar» al resto
// (spec 2026-09-22-posts-limpieza-al-borrar-pase). Autor o moderador: lo decide
// la RLS de `posts` dentro de `deletePost`; la tarjeta solo muestra el menú si
// `event.viewerCanDelete`.
//
// La tarjeta desaparece SOLO tras `ok:true`: si la RLS lo bloqueó o hubo un
// fallo, se queda y avisa en línea (nunca desaparece a ciegas).
//
// En /post/[id] la tarjeta ES la cabecera de la página: ocultarla dejaría un
// hilo sin post, así que ahí se vuelve a Inicio.
export function useDeletePost(postId: string | null | undefined) {
  const t = useTranslations("feed");
  const router = useRouter();
  const pathname = usePathname();
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function requestDelete() {
    if (!postId) return;
    if (!window.confirm(t("postDeleteConfirm"))) return;
    setError(false);
    startTransition(async () => {
      const result = await deletePost(postId);
      if (!result.ok) {
        setError(true);
        return;
      }
      if (pathname === `/post/${postId}`) router.replace("/");
      else setDeleted(true);
    });
  }

  return { deleted, error, pending, requestDelete };
}

// `ActionMenu` ya trae aria-haspopup, cierre por Escape/clic fuera y el estilo
// `danger`. Mismo trigger que tenía ThoughtCard.
export function PostDeleteMenu({ onDelete, pending }: { onDelete: () => void; pending: boolean }) {
  const t = useTranslations("feed");
  return (
    <ActionMenu
      label={t("postMenu")}
      triggerClassName="rounded-full px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      items={[
        {
          key: "delete",
          label: t("postDelete"),
          onSelect: onDelete,
          disabled: pending,
          danger: true,
        },
      ]}
    />
  );
}

export function PostDeleteError() {
  const t = useTranslations("feed");
  return (
    <p role="alert" className="text-[11px] text-status-dropped">
      {t("postDeleteError")}
    </p>
  );
}
```

En `messages/es.json`, bloque `feed`, sustituye las cuatro claves `thoughtMenu`, `thoughtDelete`, `thoughtDeleteConfirm` y `thoughtDeleteError` por:

```json
    "postMenu": "Opciones",
    "postDelete": "Eliminar",
    "postDeleteConfirm": "¿Eliminar esta publicación? Se borran también sus comentarios. No se puede deshacer.",
    "postDeleteError": "No se pudo eliminar.",
```

(`thoughtShared` se queda: no es del menú.)

- [ ] **Step 4: Pasa ThoughtCard al menú compartido**

En `src/components/social/thought-card.tsx`:

1. Imports: quita `useState`, `useTransition`, `ActionMenu` y `deletePost`; añade
   `import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";`.
2. Sustituye el bloque de estado, desde `const [deleted, setDeleted] = useState(false);` hasta el final de `function confirmDelete() {…}` (incluido el `const thoughtId = …`), por:

```tsx
  // Hooks SIEMPRE antes del early return de abajo (`if (!thought || deleted)`).
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  if (!thought || deleted) return null;
  const actorName = event.actorDisplayName || event.actorUsername;

  const bodyEl = <RichTextView text={thought.body} knownUsernames={knownUsernames} />;
```

3. Sustituye `const deleteMenu = event.viewerCanDelete && thoughtId && (<ActionMenu …/>);` por:

```tsx
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );
```

   Conserva el comentario que lo precede (el de `viewerCanDelete` y `hideActor`).
4. Sustituye el `<p role="alert">…{t("thoughtDeleteError")}</p>` por `{deleteError && <PostDeleteError />}`.

- [ ] **Step 5: Pasa los tests y el typecheck**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/social/post-delete-menu.test.tsx; npx tsc --noEmit`
Esperado: 5 tests PASS; tsc sin errores. Comprueba además que no queda ninguna referencia a las claves viejas:
`git grep -n "thoughtMenu\|thoughtDelete" -- src messages` → sin resultados.

- [ ] **Step 6: Commit**

```bash
git add src/components/social/post-delete-menu.tsx src/components/social/post-delete-menu.test.tsx src/components/social/thought-card.tsx messages/es.json
git commit -m "refactor(posts): menu de borrar post compartido, extraido de ThoughtCard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: «Eliminar» en las tarjetas de hito, reseña y avance, y los avisos de confirmación

**Files:**
- Modify: `src/components/social/milestone-card.tsx`
- Modify: `src/components/social/review-card.tsx`
- Modify: `src/components/social/progress-timeline-card.tsx`
- Modify: `messages/es.json` (`passes.deleteConfirm`, `item.unfollowConfirm`)

**Interfaces:**
- Consumes: `useDeletePost`, `PostDeleteMenu` y `PostDeleteError` de `./post-delete-menu` (Task 3), y `FeedEvent.viewerCanDelete?: boolean` / `FeedEvent.postId?: string` de `@/lib/social/feed`.

El patrón es el mismo en `MilestoneCard` y `ReviewCard`, calcado de `ThoughtCard`: con cabecera, el menú va al final de la fila de cabecera; con `hideActor`, va en su propia fila alineada a la derecha. Esa fila existe porque un `absolute` se solapaba con el contenido.

- [ ] **Step 1: MilestoneCard**

En `src/components/social/milestone-card.tsx`:

Import: `import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";`

Al principio del cuerpo, tras `const actorName = …`:

```tsx
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  if (deleted) return null;
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );
```

Sustituye el bloque `{!hideActor && ( <div className="flex items-center gap-2.5"> … </div> )}` por:

```tsx
      {!hideActor ? (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">
              {actorName}
            </Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
          {deleteMenu}
        </div>
      ) : (
        deleteMenu && <div className="-mb-1 flex justify-end">{deleteMenu}</div>
      )}
```

Justo antes del `<TimeAgo …/>` final: `{deleteError && <PostDeleteError />}`.

- [ ] **Step 2: ReviewCard**

En `src/components/social/review-card.tsx`, el mismo import. Tras el cálculo de `meta`:

```tsx
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  if (deleted) return null;
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );
```

Ojo: el hook tiene que ir DESPUÉS de `useTranslations` y ANTES de cualquier `return`. `meta` no es un hook, así que el orden vale.

Sustituye `{!hideActor && ( <div …> … </div> )}` por la misma forma de ternario del Step 1, con esta fila de cabecera (la píldora `kind.review` se queda y el menú va detrás):

```tsx
      {!hideActor ? (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
            {t("kind.review")}
          </span>
          {deleteMenu}
        </div>
      ) : (
        deleteMenu && <div className="-mb-1 flex justify-end">{deleteMenu}</div>
      )}
```

Antes del `<TimeAgo …/>` final: `{deleteError && <PostDeleteError />}`.

- [ ] **Step 3: ProgressTimelineCard (solo singleton de post)**

En `src/components/social/progress-timeline-card.tsx`, el mismo import. Tras `const { visible, hiddenCount, collapsible } = …`:

```tsx
  // Solo un avance que ES un post se borra desde aquí: el singleton que
  // feed-item envuelve como grupo de 1. Un grupo de varias sesiones no es un
  // post y no tiene nada que borrar.
  const soloPost = entry.items.length === 1 ? entry.items[0] : null;
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(soloPost?.postId);
  if (deleted) return null;
  const deleteMenu = soloPost?.viewerCanDelete && soloPost.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );
```

En la fila de cabecera (el `<div className="flex items-center gap-2.5">` que acaba con la píldora `t("kind.progress")`), añade `{deleteMenu}` justo después de esa píldora. Esta tarjeta pinta la cabecera también con `hideActor`, así que no hace falta una fila aparte.
Antes del `<TimeAgo …/>` final de la tarjeta: `{deleteError && <PostDeleteError />}`.

- [ ] **Step 4: Textos de confirmación**

En `messages/es.json`:

```json
    "deleteConfirm": "Borrar este pase borra su nota, su reseña, sus sesiones y sus publicaciones en el feed. No se puede deshacer.",
```

(la clave `passes.deleteConfirm`, línea ~281) y

```json
    "unfollowConfirm": "Quitarla de tu biblioteca borra TODOS sus pases, con sus notas, reseñas y publicaciones. No se puede deshacer.",
```

(la clave `item.unfollowConfirm`). Comprueba que ningún e2e depende del texto viejo:
`git grep -n "sus sesiones. No se puede\|con sus notas y reseñas" -- e2e src` → sin resultados.

- [ ] **Step 5: Typecheck, lint y suite de unitarios**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npx eslint src/components/social; npx vitest run src/components/social src/lib/social`
Esperado: todo en verde. (`react-hooks/rules-of-hooks` es el que caza un hook después de un `return`).

- [ ] **Step 6: Commit**

```bash
git add src/components/social/milestone-card.tsx src/components/social/review-card.tsx src/components/social/progress-timeline-card.tsx messages/es.json
git commit -m "feat(posts): eliminar hitos, resenas y avances propios desde su tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: e2e — borrar el pase se lleva el post, y borrar desde la tarjeta y desde /post/[id]

**Files:**
- Modify: `e2e/posts.spec.ts` (dos tests nuevos al final; los helpers `rest`, `insertOne`, `devtestId` y `login` ya existen en el fichero)

**Interfaces:**
- Consumes: la migración de la Task 1 aplicada en dev; el menú «Opciones» → «Eliminar» de la Task 4; el menú «Acciones del pase» → «Borrar pase» del diario (`/libro/<id>?tab=log`).

- [ ] **Step 1: Escribe los tests**

Añade al final de `e2e/posts.spec.ts`:

```ts
// Spec 2026-09-22 (limpieza de posts): un hito muere con su pase. Datos propios
// por REST con service-role y borrados en el `finally` (mismo patrón que el
// test de /post/[id] de arriba).
test("borrar el pase desde el diario se lleva su post de hito", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await devtestId();
  const title = `E2E Pase Borrado ${Date.now()}`;
  let bookId: string | null = null;
  let passId: string | null = null;

  try {
    const book = await insertOne<{ id: string }>("books", { title });
    bookId = book.id;
    const pass = await insertOne<{ id: string }>("passes", {
      user_id: owner, item_type: "book", item_id: bookId, status: "completed",
      is_active: true, is_public: true, started_on: "2026-09-01", finished_on: "2026-09-02",
      position: {},
    });
    passId = pass.id;
    const post = await insertOne<{ id: string }>("posts", {
      author_id: owner, kind: "finished", anchor_type: "book", anchor_id: bookId,
      source_kind: "pass", source_id: passId,
    });

    await login(page);
    await page.goto(`/post/${post.id}`);
    await expect(page.locator("article").filter({ hasText: title })).toBeVisible();

    await page.goto(`/libro/${bookId}?tab=log`);
    // Playwright DESCARTA los diálogos por defecto: sin esto confirm() = false.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Acciones del pase" }).first().click({ timeout: 15_000 });
    await page.getByRole("menuitem", { name: "Borrar pase" }).click();

    await expect
      .poll(async () => (await rest<{ id: string }[]>(`passes?id=eq.${passId}&select=id`)).length, { timeout: 15_000 })
      .toBe(0);
    passId = null;
    expect(await rest<{ id: string }[]>(`posts?id=eq.${post.id}&select=id`)).toHaveLength(0);

    await page.goto("/");
    await expect(page.locator("article").filter({ hasText: title })).toHaveCount(0);
  } finally {
    if (bookId) await rest(`posts?anchor_id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    if (passId) await rest(`passes?id=eq.${passId}`, { method: "DELETE" }).catch(() => {});
    if (bookId) await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
  }
});

test("un hito propio se elimina desde su tarjeta, y desde /post/[id] vuelve a Inicio", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await devtestId();
  const ts = Date.now();
  const feedTitle = `E2E Hito Feed ${ts}`;
  const pageTitle = `E2E Hito Pagina ${ts}`;
  const bookIds: string[] = [];
  const passIds: string[] = [];

  async function hito(title: string) {
    const book = await insertOne<{ id: string }>("books", { title });
    bookIds.push(book.id);
    const pass = await insertOne<{ id: string }>("passes", {
      user_id: owner, item_type: "book", item_id: book.id, status: "completed",
      is_active: true, is_public: true, started_on: "2026-09-01", finished_on: "2026-09-02",
      position: {},
    });
    passIds.push(pass.id);
    return insertOne<{ id: string }>("posts", {
      author_id: owner, kind: "finished", anchor_type: "book", anchor_id: book.id,
      source_kind: "pass", source_id: pass.id,
    });
  }

  try {
    const feedPost = await hito(feedTitle);
    const pagePost = await hito(pageTitle);

    await login(page);

    // ── Desde la tarjeta del feed ──
    await page.goto("/");
    const card = page.locator("article").filter({ hasText: feedTitle });
    await expect(card).toBeVisible({ timeout: 15_000 });
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Opciones" }).click();
    await page.getByRole("menuitem", { name: "Eliminar" }).click();
    await expect(card).toHaveCount(0);
    expect(await rest<{ id: string }[]>(`posts?id=eq.${feedPost.id}&select=id`)).toHaveLength(0);
    // El pase NO se toca: borrar el post no borra la lectura.
    expect(await rest<{ id: string }[]>(`passes?id=eq.${passIds[0]}&select=id`)).toHaveLength(1);

    // ── Desde /post/[id]: redirige a Inicio ──
    await page.goto(`/post/${pagePost.id}`);
    const header = page.locator("article").filter({ hasText: pageTitle });
    await expect(header).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await header.getByRole("button", { name: "Opciones" }).click();
    await page.getByRole("menuitem", { name: "Eliminar" }).click();
    await page.waitForURL("/");
    expect(await rest<{ id: string }[]>(`posts?id=eq.${pagePost.id}&select=id`)).toHaveLength(0);
  } finally {
    if (bookIds.length) await rest(`posts?anchor_id=in.(${bookIds.join(",")})`, { method: "DELETE" }).catch(() => {});
    for (const id of passIds) await rest(`passes?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    for (const id of bookIds) await rest(`books?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
  }
});
```

Nota para quien implementa: el post del feed se inserta con `created_at` de ahora, así que sale el primero de Inicio. El problema de #825/#1073 es con posts de fecha atrasada, no aplica aquí.

- [ ] **Step 2: Arranca el servidor a mano y ejecuta**

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```
Si hay algo en el 3000, mátalo con `Stop-Process -Id <pid>`. Después, en segundo plano:
`fnm env | Out-String | Invoke-Expression; fnm use 22; npm run dev`
Espera a que responda:
`curl --retry 90 --retry-delay 2 --retry-all-errors -s -o /dev/null http://localhost:3000/`
Y lanza:
`fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test e2e/posts.spec.ts`

Esperado: los 9 tests de `posts.spec.ts` PASS, incluidos los 2 nuevos y el de `/post/[id]`, que valida que `ThoughtCard` sigue funcionando. Si alguno sale «skipped», falta `.env.local` en el worktree.

- [ ] **Step 3: Mata el `next dev` y haz commit**

`Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess` → `Stop-Process -Id <pid>`.

```bash
git add e2e/posts.spec.ts
git commit -m "test(e2e): el post de hito muere con su pase y se elimina desde su tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Producción, issues y cierre

**Files:**
- Modify: `docs/requirements/data-model.md` (línea de delta: «verificado en prod»)

- [ ] **Step 1: Comprueba que prod está donde asume la migración**

`execute_sql` en `vmutcradmodhiltuohys`:

```sql
select tgname from pg_trigger where tgname in ('posts_cleanup_social_target','passes_cleanup_source_posts');
select enum_range(null::public.post_source_kind);
```

Esperado: existe `posts_cleanup_social_target` y NO existe `passes_cleanup_source_posts`; el enum es `{pass,progress_session,episode_watch}`.

- [ ] **Step 2: Pide autorización al usuario y aplica en prod**

Enséñale al usuario la tabla de medición de la Task 2 (fila de prod). **Si prod tiene huérfanos con comentario o reacción ajena, pregunta expresamente si se aplica la `20260922120100`.** Con su «sí» en el chat:
1. `apply_migration` en prod: `posts_cleanup_on_source_delete`.
2. (si lo autorizó) `apply_migration` en prod: `posts_orphans_backfill`.
3. Verifica con las consultas del Task 1 Step 4 y del Task 2 Step 1 contra prod.

Actualiza la línea de delta de `data-model.md` a «verificados en dev y prod».

- [ ] **Step 3: Abre las issues pendientes**

Escribe los cuerpos en el scratchpad y ejecuta:

```bash
gh issue create --repo borjar20/Biblioshare --label "area:social,tipo:deuda,P2" \
  --title "Deshacer un estado (Terminado→Leyendo, Terminado→Abandonado) deja el post de hito que ya no es cierto" \
  --body-file <scratchpad>/issue-deshacer-estado.md
```

Contenido mínimo:
- **Qué pasa:** pasar de Terminado a Leyendo archiva el pase y crea otro; pasar de Terminado a Abandonado corrige el mismo pase. En los dos casos el post `finished` sigue en el feed. El trigger `*_cleanup_source_posts` (2026-09-22) no salta porque el pase no se borra.
- **Cómo reproducir:** marcar Terminado con `autopost_finished` activo y después Leyendo; el post sigue en Inicio.
- **Qué sí funciona:** borrar el post a mano desde la tarjeta, y borrar el pase.
- **Dónde tocar:** `planTransition` / `applyTransition` (`src/lib/passes/`).
- **La trampa:** Terminado→Leyendo por relectura es un gesto legítimo, y ahí el `finished` del pase archivado SÍ es cierto. Solo sobra en la corrección de un error.

Y un comentario en #845:

```bash
gh issue comment 845 --repo borjar20/Biblioshare --body "Camino nuevo de audios huérfanos (2026-09-22): private.cleanup_source_posts borra posts de hito al borrar su pase/sesión/episodio, y con ellos sus comentarios; los audio_path de esos comentarios quedan en Storage (deletePost los limpia, el trigger no puede). Spec: docs/superpowers/specs/2026-09-22-posts-limpieza-al-borrar-pase-design.md §4.4."
```

- [ ] **Step 4: Commit y PR**

```bash
git add docs/requirements/data-model.md
git commit -m "docs(posts): triggers de limpieza verificados en prod

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Abre la PR contra `main`. En el cuerpo: resumen, la tabla de medición de huérfanos (dev y prod), las respuestas al checklist de caché de AGENTS.md (no aplica: no hay `use cache`), el enlace a la spec y a la issue nueva, y el pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
