type LibraryToolIconName = "notebook" | "challenges" | "statistics";

/** UI glyphs share a 16-unit pixel grid, displayed at 2× in Library tools. */
export function LibraryToolIcon({
  name,
  className,
}: {
  name: LibraryToolIconName;
  className?: string;
}) {
  const ink = "var(--foreground)";
  const paper = "var(--surface)";
  const accent = "var(--accent)";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="32"
      height="32"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
    >
      {name === "notebook" && (
        <>
          <path fill={ink} d="M4 1h9v1h1v12h-1v1H4v-1H3V2h1Z" />
          <path fill={accent} d="M4 2h2v12H4Z" />
          <path fill={paper} d="M6 2h7v12H6Z" />
          <path fill={ink} d="M2 4h3v1H2Zm0 3h3v1H2Zm0 3h3v1H2Z" />
          <path fill="var(--foreground-soft)" d="M8 4h3v1H8Zm0 3h3v1H8Zm0 3h3v1H8Z" />
          <path fill="var(--surface-muted)" d="M6 13h7v1H6Z" />
        </>
      )}
      {name === "statistics" && (
        <>
          <path fill={ink} d="M1 2h1v11h13v1H1Zm3 6h3v4H4Zm4-3h3v7H8Zm4-3h3v10h-3Z" />
          <path fill="var(--type-book)" d="M5 9h1v3H5Z" />
          <path fill="var(--type-movie)" d="M9 6h1v6H9Z" />
          <path fill="var(--type-series)" d="M13 3h1v9h-1Z" />
        </>
      )}
      {name === "challenges" && (
        <>
          <path fill={ink} d="M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2Z" />
          <path fill={paper} d="M5 2h6v1h2v3h1v4h-1v3h-2v1H5v-1H3v-3H2V6h1V3h2Z" />
          <path fill={accent} d="M6 4h4v1h2v2h1v2h-1v2h-2v1H6v-1H4V9H3V7h1V5h2Z" />
          <path fill={paper} d="M6 5h4v1h1v4h-1v1H6v-1H5V6h1Z" />
          <path fill={accent} d="M7 7h2v2H7Z" />
        </>
      )}
    </svg>
  );
}
