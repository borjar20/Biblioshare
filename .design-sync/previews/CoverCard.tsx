import { CoverCard } from "@/components/ui/cover-card";
import { StatusBadge } from "@/components/ui/status-badge";

// Inline placeholder cover art (2:3, book-accent color) — data: URIs render
// directly through next/image without hitting the (nonexistent, in this
// preview context) /_next/image optimizer endpoint.
const COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjYjQ1MzA5Ii8+PHJlY3QgeD0iMTgiIHk9IjE4IiB3aWR0aD0iMjY0IiBoZWlnaHQ9IjQxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMyIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+";

export function Default() {
  return (
    <div className="w-40">
      <CoverCard
        href="/libro/1"
        coverUrl={COVER}
        title="Cien años de soledad"
        subtitle="Gabriel García Márquez"
        badge={<StatusBadge status="in_progress" label="Leyendo" />}
      />
    </div>
  );
}

export function NoCover() {
  return (
    <div className="w-40">
      <CoverCard
        href="/libro/2"
        coverUrl={null}
        title="El nombre del viento"
        subtitle="Patrick Rothfuss"
      />
    </div>
  );
}
