"use client";

import Image from "next/image";
import type { ImportCandidate } from "@/lib/import/types";

// Lista de candidatos de una fila ambigua (la maqueta de desempate): portada,
// título con año, títulos alternativos y sinopsis —lo único que distingue dos
// obras del mismo título y año—. Presentacional: la usan tanto la pantalla de
// triaje del propio import (`AmbiguousRowForm`) como la cola de revisión del
// colaborador (`ResolveForm`, issue #390); cada una decide qué hace `onChoose`.
export function CandidateList({
  candidates,
  onChoose,
  disabled,
}: {
  candidates: ImportCandidate[];
  onChoose: (candidate: ImportCandidate) => void;
  disabled: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {candidates.map((candidate) => {
        const alt = altTitles(candidate);
        return (
          <li key={candidate.externalId}>
            <button
              type="button"
              onClick={() => onChoose(candidate)}
              disabled={disabled}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-2 text-left transition hover:border-accent disabled:opacity-50"
            >
              <span className="relative aspect-2/3 w-10 shrink-0 overflow-hidden rounded bg-surface-muted">
                {candidate.coverUrl && (
                  <Image
                    src={candidate.coverUrl}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {candidate.title}
                  {candidate.year !== null && (
                    <span className="text-muted-foreground"> ({candidate.year})</span>
                  )}
                </span>
                {alt.length > 0 && (
                  <span className="line-clamp-1 font-serif text-[11px] italic text-muted-foreground">
                    {alt.join(" · ")}
                  </span>
                )}
                {candidate.synopsis && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {candidate.synopsis}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Los otros dos títulos (original e inglés) solo si aportan algo: son justo lo
// que le dice al usuario que "La visita" es la peli que anotó como "The Visit".
function altTitles(candidate: ImportCandidate): string[] {
  const seen = new Set([candidate.title.toLowerCase()]);
  const out: string[] = [];
  for (const title of [candidate.englishTitle, candidate.originalTitle]) {
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push(title);
  }
  return out;
}
