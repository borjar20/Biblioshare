import Link from "next/link";

// Lógica pura de visibilidad del pager, separada del JSX para poder testear
// el límite "next oculto en la última página / prev oculto en la primera"
// con un test unitario normal (vitest solo corre .test.ts, sin DOM/RTL en
// este repo — ver vitest.config.ts). Cubre el caso página 2 alcanzable: con
// totalPages=2 y page=1, showNext debe ser true.
export function genrePagerState(page: number, totalPages: number) {
  return {
    visible: totalPages > 1,
    showPrev: page > 1,
    showNext: page < totalPages,
  };
}

// Anterior / siguiente sobre `?pagina=N`, mismo patrón que NotesPager
// (src/app/notas/notes-pager.tsx): navegación server-side, sin estado en
// cliente. La página de género no tiene más filtros en la URL, así que el
// href no necesita preservar nada más que el slug.
export function GenrePager({
  slug,
  page,
  totalPages,
}: {
  slug: string;
  page: number;
  totalPages: number;
}) {
  const { visible, showPrev, showNext } = genrePagerState(page, totalPages);
  if (!visible) return null;

  const href = (n: number) => (n > 1 ? `/genero/${slug}?pagina=${n}` : `/genero/${slug}`);

  return (
    <nav className="flex items-center justify-between gap-3 pt-2">
      {showPrev ? (
        <Link
          href={href(page - 1)}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ‹ Anteriores
        </Link>
      ) : (
        <span />
      )}

      <span className="font-mono text-[11px] text-muted-foreground">
        Página {page} de {totalPages}
      </span>

      {showNext ? (
        <Link
          href={href(page + 1)}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Siguientes ›
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
