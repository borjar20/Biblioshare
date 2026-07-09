import type { ReactNode } from "react";

// "Información" tab body: synopsis (+ any extra content such as credits) beside
// the metadata sidebar.
export function InfoPanel({
  aboutLabel,
  synopsis,
  noSynopsisLabel,
  sidebar,
  extra,
}: {
  aboutLabel: string;
  synopsis: string | null;
  noSynopsisLabel: string;
  sidebar: ReactNode;
  extra?: ReactNode;
}) {
  const paragraphs = synopsis
    ? synopsis.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];

  return (
    <div className="grid items-start gap-8 md:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{aboutLabel}</h2>
        {paragraphs.length > 0 ? (
          paragraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground">
              {p}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{noSynopsisLabel}</p>
        )}
        {extra}
      </div>
      {sidebar}
    </div>
  );
}
