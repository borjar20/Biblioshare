import Link from "next/link";
import { Fragment } from "react";
import { parseRichText, type Segment } from "@/lib/social/rich-text";

// Presentación pura del markdown-lite de un Pensamiento (Fase 5, Task 5.2):
// negrita/cursiva/lista + @mención, esta última linkificada SOLO si el
// username existe de verdad (mismo criterio que MentionText — nunca un
// enlace muerto). Sin test de componente: no hay runner cableado en el
// repo, cubierto por el e2e de la Fase 6. La lógica de tokens en sí vive en
// rich-text.ts y SÍ tiene tests unitarios.
function SegmentView({ segment, knownUsernames }: { segment: Segment; knownUsernames: string[] }) {
  if (segment.kind === "bold") return <b>{segment.text}</b>;
  if (segment.kind === "italic") return <i>{segment.text}</i>;
  if (segment.kind === "mention") {
    const username = segment.text.slice(1); // quita la "@"
    const known = knownUsernames.some((u) => u.toLowerCase() === username.toLowerCase());
    if (known) {
      return (
        <Link href={`/u/${username.toLowerCase()}`} className="font-medium text-accent hover:underline">
          {segment.text}
        </Link>
      );
    }
    return <span className="text-accent">{segment.text}</span>;
  }
  return <>{segment.text}</>;
}

export function RichTextView({ text, knownUsernames = [] }: { text: string; knownUsernames?: string[] }) {
  const lines = parseRichText(text);
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line.isList && <span aria-hidden className="mr-1.5">•</span>}
          {line.segments.map((segment, j) => (
            <Fragment key={j}>
              <SegmentView segment={segment} knownUsernames={knownUsernames} />
            </Fragment>
          ))}
        </span>
      ))}
    </>
  );
}
