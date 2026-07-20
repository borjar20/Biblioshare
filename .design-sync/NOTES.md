# Biblioshare design-sync notes

Biblioshare is a Next.js App Router app, not a standalone design-system
package — there is no `dist/`, no Storybook, no publishable component
library. This sync uses the **package shape** with a hand-written barrel
entry (`src/design-sync-shims/entry.ts`) instead of the synth-from-src
fallback, because a full `src/` scan would have pulled in every page/layout
component in the app. `componentSrcMap` pins the exact 18 components in
scope; nothing else is discovered.

## Scope decisions

- **Excluded `ClubCard`, `FollowButton`, `NotificationBell`, `FeedCard`**
  (discovered during the first build, not upfront): each imports a real
  `"use server"` Supabase mutation (`joinClub`, `followUser`/`unfollowUser`,
  `markAllNotificationsRead`; `FeedCard` pulls this in transitively via
  `ReviewInteractions` → `toggleReaction`/`addComment`/`deleteComment`).
  Those server actions import `@/lib/supabase/server` (`next/headers`,
  `next/cache`) and drag in Node-only transitive deps (`net`, `crypto`,
  `jsonwebtoken` internals via `jws`/`jwa`) that esbuild can't bundle for a
  browser IIFE — hard build failure, not just an unrendered interaction.
  Swapping the action import for a mock would mean editing the real
  component's dependency graph, which crosses into reimplementation
  territory the skill forbids. If these are wanted later, the fix belongs
  upstream (e.g. splitting the presentational card from the server-action
  wiring in the app itself), not in this sync.
- **Excluded `icons.tsx`**: it's a module of ~27 individual SVG icon
  components (BookIcon, FilmIcon, TrophyIcon, ...), not one reusable
  component. Icons are used internally by the synced components (e.g.
  `BookIcon`/`FilmIcon`/`SeriesIcon` inside `ItemHero`) but aren't synced as
  standalone cards.
- **Excluded `StreakCard` and `WeeklyStrip`** (`src/components/stats/`):
  both are async Server Components that call `getTranslations` from
  `next-intl/server`. The converter bundles into a client-side IIFE for
  browser rendering — there is no RSC pipeline, so these can't render
  standalone. Would need a client-side rewrite to sync, which is out of
  scope for an import (real shipped code only, never a reimplementation).
- Excluded all composer/form/mutation-heavy components (`activity-composer`,
  `club-form`, `club-post-composer`, `manage-members`, `goals-form`,
  `*-actions.ts`, `club-cover-upload`, `library-item-picker`,
  `follow-requests`, `request-actions`) and pure container/tab components
  (`item-detail-tabs`, `home-tabs`, `episode-panel`, `episode-grid`,
  `episode-list`, `info-panel`, `community-panel`, `club-feed`,
  `club-header`, `annual-stats`, `feed-filters`, `review-interactions`,
  `private-profile-stub`, `club-post-card`, `activity-detail`,
  `activity-item-pool`, `activity-opinions`, `activity-share-picker`,
  `push-toggle`) — user-confirmed scope, see conversation.

Final scope (18): `Button`, `Input`, `Field`, `CoverCard`, `GenreTag`,
`ProgressBar`, `RatingDots`, `StatusBadge`, `ActivityCard`, `UserCard`,
`UserAvatar`, `CircularProgress`, `MonthCalendar`, `ItemHero`,
`MetadataSidebar`, `EpisodeRating`, `SagaStrip`, `BackButton`.

## `process` is not defined (Next.js internals in a browser bundle)

Bundling `next/navigation`/`next/image`/`next/link` pulls in Next.js
internals that read `process.env.*`/`process.platform`/`process.nextTick`
at module scope. The converter's esbuild `define` only sets
`process.env.NODE_ENV`, so the bundle threw `ReferenceError: process is not
defined` at load — which broke **every** component, since all 18 share one
`_ds_bundle.js` IIFE. Fixed with `src/design-sync-shims/process-shim.ts` (a
`globalThis.process` polyfill, side-effect only) listed **first** in
`cfg.extraEntries` — ES module evaluation order means a zero-dependency
module imported first runs before anything else in the graph. If a re-sync
ever reintroduces this error, it's almost certainly a new component pulling
in more of the Next.js internals; the shim already covers `env`/`platform`/
`nextTick` but may need more properties for a different code path.

## Two-bundle Context identity (the *harder* Next.js problem)

Preview cards (`.design-sync/previews/*.tsx`) compile in a **separate**
esbuild pass from the main bundle (`lib/previews.mjs` vs `lib/bundle.mjs`).
`cfg.provider`'s wrapping happens once, outside, using the *main bundle's*
copy of `PreviewProvider` — but a component's `useTranslations()`/
`useRouter()` call reads a React Context object created inside the
*preview's own* separate compile. Two separate esbuild builds → two
separate `createContext()` calls → two different Context object identities
→ the outer Provider is invisible to the hook, which sees no Provider and
throws (`next-intl`: blank `Error`; `next/navigation`: "invariant expected
app router to be mounted").

Fix: the 4 components that need it (`ActivityCard`, `MonthCalendar`,
`BackButton`, `ItemHero`) import `PreviewProvider` **directly in their own
preview `.tsx` file** and wrap their own story JSX in it (plus a leading
`import "@/design-sync-shims/process-shim"`, since this new import path
brings the same Next.js internals into the preview's own compile too). That
keeps Provider and consumer in the same compile, so the Context identity
matches. **If a new component needing `useTranslations`/`useRouter` is added
to the sync, its preview file needs this same self-wrap** — `cfg.provider`
alone will NOT be enough, and the failure mode (`root empty` / blank
`Error`) doesn't obviously point here.

## Fonts (Fraunces, Geist, Geist Mono)

The app loads these via `next/font/google` in `src/app/layout.tsx`, which
self-hosts font files at Next's own build time — nothing on disk in the
repo to point `cfg.extraFonts` at. Fetched the actual `.woff2` files
(OFL-licensed, one weight each: Fraunces 600/700, Geist 400/500, Geist Mono
400) directly from `fonts.googleapis.com`/`fonts.gstatic.com` with a real
browser UA (to get `woff2` instead of `ttf`) and committed them under
`.design-sync/fonts-src/` alongside a hand-written `fonts.css` with local
`@font-face` rules — `cfg.extraFonts` only copies **local** `url()`
references into `fonts/`, remote ones are left as-is (and would silently
fail in the design tool's sandboxed, likely network-restricted render).
`cfg.buildCmd` also appends a `:root { --font-fraunces: 'Fraunces', serif;
... }` block after the Tailwind CLI run, because `cfg.extraFonts` only
extracts `@font-face` rules — it doesn't carry over the custom-property
mapping the app defines via `next/font`'s `variable` option at runtime.
**The committed woff2 files mean re-sync does NOT need network access for
fonts** — only `cfg.buildCmd`'s `npx @tailwindcss/cli` step needs network
(or a warm npx cache).

## Provider shim

`src/design-sync-shims/preview-provider.tsx` (`PreviewProvider`, wired via
`cfg.provider` + `cfg.extraEntries`, and self-wrapped directly in 4 preview
files — see above) wraps in:
- `NextIntlClientProvider` (locale `es`, messages from `messages/es.json`)
  — needed by every component using `useTranslations`/`useFormatter`.
- A mock `next/navigation` `AppRouterContext.Provider` (no-op router) —
  `next/navigation`'s `useRouter()` throws immediately outside an App
  Router context (`BackButton`, embedded in `ItemHero`, needs this).

`next/image` and `next/link` render fine as real npm deps (no shim needed);
`data:` URIs work directly through `next/image` without hitting the
(nonexistent, in a rendered design) `/_next/image` optimizer endpoint —
used throughout the previews instead of remote cover/avatar URLs, which the
render sandbox likely blocks anyway.

## Typecheck the previews — the render check CANNOT catch stale props

**Run this before grading, every re-sync.** It is the single highest-value
step in this repo's sync:

```sh
npx tsc -p .design-sync/.cache/tsconfig.previews.json   # config is gitignored; recreate if missing:
# { "extends": "../../tsconfig.json",
#   "compilerOptions": { "noEmit": true, "baseUrl": "../..", "paths": {"@/*": ["src/*"]} },
#   "include": ["../previews/*.tsx"] }
```

The preview `.tsx` files are compiled by **esbuild, which strips types
without checking them**. A preview passing a prop the component no longer
has, or omitting one it gained, therefore compiles fine, renders fine, and
passes the render check with zero flags — the extra prop is ignored and the
missing one just doesn't draw. On the 2026-07-20 re-sync the render check
reported `18/18 previews render cleanly` across three separate passes while
four previews were silently wrong:

- `RatingDots` — passed `fillClassName="bg-type-*"`, a prop that no longer
  exists. The component now hardcodes `var(--gold)` **on purpose** (see its
  source comment: the rating is gold everywhere, type colour is reserved for
  identifying the medium). The `MediaAccent` story was rendering three
  identical gold rows *and* advertising an API contrary to the design
  language — replaced with a `Sizes` sweep of the real `size` prop.
- `ItemHero` ×3 — `ratingCount` was removed; the count is now baked into
  `ratingsLabel` by the caller (`t("ratings", {count})`), which is why the
  cards read "valoraciones" with no number.
- `SagaStrip` — `label` was renamed `positionLabel`, so the position text
  rendered not at all.
- `ActivityCard` — mock missing `config`, `spawnedFromActivityId`,
  `spawnedFromItem`. Note `Partial<T>` spreads make *every* required field
  the base object omits surface as `T | undefined`, so tsc reports them one
  at a time — expect a few iterations.

**`conventions.md` needs the same scrutiny and matters more**: it is inlined
into the design agent's system prompt, so a stale prop there is copied into
every design that agent ever builds. It carried the same `ratingCount`.
Validate its class names against `ds-bundle/_ds_bundle.css` — but note
Tailwind writes escaped selectors (`.hover\:bg-accent-hover`), so a naive
`grep '\.hover:bg-...'` reports a false ABSENT.

## Known render warns

None. As of 2026-07-20 the render check is fully clean: 18/18 render, and
`bad`/`thin`/`blank`/`variantsIdentical`/`fallbackCard` are all empty. Any
warn on a future run is new — investigate rather than assume it's baseline.

## Preview art is inline `data:` SVG (no network in the render sandbox)

Covers and avatars are inline data URIs. Keep the aspect right for the
**shape it renders into**: the avatar photo was originally a 300×450
cover-aspect rect, which circle-cropped to a flat purple disc
indistinguishable from the no-photo state. It is now a 200×200 gradient with
a head-and-shoulders silhouette. A flat colour block is not a photo story.

## Re-sync risks

- `src/design-sync-shims/entry.ts` and `preview-provider.tsx` are hand
  maintained — if a synced component is renamed/moved/removed, or a new one
  is added to the sync, both files need a matching edit (barrel export +
  `componentSrcMap` entry), and any preview needing translations/routing
  needs the self-wrap pattern above.
- The provider shim's mocked router/translations are frozen: if a synced
  component starts depending on a real navigation or locale value in a new
  way, the mock may silently no-op instead of surfacing correctly.
- `messages/es.json` is read at build time via a relative `import` in the
  shim — if it moves, the shim breaks with a resolution error, not a config
  warning.
- **App-code drift is the top risk, and it is invisible to the render check**
  — see the typecheck section above. Between 2026-07-13 and 2026-07-20,
  15 of the 18 synced components changed and 4 previews went stale without a
  single render failure. Always typecheck first.
- The **claude.ai/design project is NOT sync-owned**: it also holds Borja's
  hand-made design work (`Paper - *.html` mockups, `uploads/`, `screenshots/`,
  `bf-*.jsx`, `handoff/`, `design_handoff_biblioshare_paper/`, `deck-stage.js`,
  `tweaks-panel.jsx`). The atomic path's deletes come verbatim from
  `.sync-diff.json`'s `upload.deletePaths`, which is anchor-scoped and so can
  only ever name sync output — **never hand-derive a delete list or reuse the
  incremental path's delete globs against this project**, and never pass a
  glob like `guidelines/**` as a delete.
- `guidelinesGlob` picks up whatever is in `docs/*.md`, so the 20-jul doc
  restructure grew `guidelines/` from 3 files to 8 with no config change.
  Additions are silent; a *removed* doc would orphan a remote file that the
  anchor cannot see, since guidelines aren't in `sourceHashes`.
- Font weights are hand-picked to match what the 18 synced components
  actually use today (Fraunces 600/700, Geist 400/500, Geist Mono 400) — a
  future component using a different weight will render with faux
  bold/browser-synthesized style until a matching woff2 is added.
