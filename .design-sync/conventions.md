## Biblioshare conventions

Biblioshare is a Spanish-language book/movie/series tracking app (Next.js App Router). This bundle ships 18 real, working UI components pulled directly from the app's `src/components/` tree.

### Wrap with `PreviewProvider` when a design uses these components

Four components — **`ActivityCard`**, **`MonthCalendar`**, **`BackButton`**, and **`ItemHero`** (which renders `BackButton` internally) — call `next-intl`'s `useTranslations()` or `next/navigation`'s `useRouter()`. Outside the real app, both throw without a host context. `PreviewProvider` (also exported on `window.Biblioshare`) supplies both a Spanish-locale translation provider and a no-op router, and is required around any design that includes one of these four:

```jsx
<Biblioshare.PreviewProvider>
  <Biblioshare.ItemHero
    itemType="book"
    mediaLabel="Libro"
    title="El nombre del viento"
    byline="Patrick Rothfuss"
    genres={["Fantasía", "Aventura"]}
    coverUrl={coverDataUri}
    avgRating={8.4}
    ratingCount={1284}
    ratingsLabel="valoraciones"
    backLabel="Volver"
  />
</Biblioshare.PreviewProvider>
```

The other 14 components (Button, Input, Field, CoverCard, GenreTag, ProgressBar, RatingDots, StatusBadge, UserAvatar, UserCard, CircularProgress, MetadataSidebar, EpisodeRating, SagaStrip) need no wrapper — use them directly.

Images go through `next/image`; when composing new designs, pass a `data:` URI or `null` for cover/avatar props (no `/next/image` optimizer endpoint exists in a rendered design, but `data:` URIs and the graceful "no image" fallback both render correctly).

### Styling idiom: Tailwind utility classes over CSS custom properties

There are no component-scoped classes or a prop-based theme API — everything is Tailwind v4 utilities resolving to CSS custom properties defined in `styles.css`. Use these names as-is; they're the app's actual design language, not a generic default:

| Purpose | Classes |
|---|---|
| Page/surface | `bg-background`, `bg-surface`, `bg-surface-muted` |
| Text | `text-foreground`, `text-muted-foreground` |
| Borders | `border-border` |
| Primary accent (buttons, links, focus rings) | `bg-accent`, `text-accent-foreground`, `hover:bg-accent-hover` |
| Reading-status dots/badges | `bg-status-planned`, `bg-status-in-progress`, `bg-status-completed`, `bg-status-dropped` |
| Per-media-type accent (book/movie/series) | `bg-type-book`/`movie`/`series`, `text-type-*`, `border-type-*`, `ring-type-*` (also `bg-type-book/10` etc. for tinted backgrounds) |
| Body / mono / display type | `font-sans` (default), `font-mono` (labels, chips, technical text), `font-serif` (item titles, big rating numbers — Fraunces) |

Light/dark both exist as real token sets (`:root` vs `.dark`) — don't hardcode colors; always reach for a token class above.

### Where the truth lives

Read `styles.css` (imports `_ds_bundle.css`, the compiled Tailwind output) before styling anything new, and each component's own `.prompt.md` for its exact prop shape and usage examples. `_ds_bundle.js`'s `.d.ts` files are the authoritative prop contracts.

### Example: composing a status-badged cover grid

```jsx
<div className="grid grid-cols-3 gap-4">
  <Biblioshare.CoverCard
    href="/libro/1"
    coverUrl={cover}
    title="Cien años de soledad"
    subtitle="Gabriel García Márquez"
    badge={<Biblioshare.StatusBadge status="in_progress" label="Leyendo" />}
  />
</div>
```
