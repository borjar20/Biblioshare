import "@/design-sync-shims/process-shim";
import { ItemHero } from "@/components/detail/item-hero";
import { PreviewProvider } from "@/design-sync-shims/preview-provider";
import { StatusBadge } from "@/components/ui/status-badge";

const BOOK_COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjYjQ1MzA5Ii8+PHJlY3QgeD0iMTgiIHk9IjE4IiB3aWR0aD0iMjY0IiBoZWlnaHQ9IjQxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMyIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+";
const SERIES_COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjN2MzYWVkIi8+PC9zdmc+";

export function Book() {
  return (
    <PreviewProvider>
      <ItemHero
        itemType="book"
        mediaLabel="Libro"
        title="El nombre del viento"
        byline="Patrick Rothfuss"
        genres={["Fantasía", "Aventura", "Clásico"]}
        coverUrl={BOOK_COVER}
        avgRating={8.4}
        ratingsLabel="1.284 valoraciones"
        backLabel="Volver"
      />
    </PreviewProvider>
  );
}

export function SeriesWithStatus() {
  return (
    <PreviewProvider>
      <ItemHero
        itemType="series"
        mediaLabel="Serie"
        title="Fundación"
        byline="Basada en la novela de Isaac Asimov"
        genres={["Ciencia ficción"]}
        coverUrl={SERIES_COVER}
        avgRating={7.1}
        ratingsLabel="342 valoraciones"
        backLabel="Volver"
        statusSlot={<StatusBadge status="in_progress" label="Viendo" />}
      />
    </PreviewProvider>
  );
}

export function NoCoverNoRatings() {
  return (
    <PreviewProvider>
      <ItemHero
        itemType="movie"
        mediaLabel="Película"
        title="Un estreno reciente"
        byline={null}
        genres={[]}
        coverUrl={null}
        avgRating={null}
        ratingsLabel="sin valoraciones"
        backLabel="Volver"
      />
    </PreviewProvider>
  );
}
