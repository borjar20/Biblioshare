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
    // Un salto de línea REAL entre líneas + `whitespace-pre-line` en el
    // contenedor, en vez de un `<span class="block">` por línea. Con los bloques,
    // una línea VACÍA —que es exactamente como se separa un párrafo— no generaba
    // caja de línea: altura 0, y los párrafos salían pegados como si el salto se
    // hubiera perdido. `pre-line` respeta los `\n` (todos, también los seguidos)
    // y sigue colapsando espacios, que es lo que se quiere en prosa pegada.
    // `break-words` vive aquí y no en cada llamador: una URL larga sin espacios
    // desbordaba la tarjeta en los sitios que se olvidaban de ponerlo.
    <span className="block whitespace-pre-line break-words">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {line.isList && <span aria-hidden className="mr-1.5">•</span>}
          {line.segments.map((segment, j) => (
            <SegmentView key={j} segment={segment} knownUsernames={knownUsernames} />
          ))}
        </Fragment>
      ))}
    </span>
  );
}
