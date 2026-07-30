import Link from "next/link";
import { Fragment } from "react";
import { MENTION_RE } from "@/lib/social/mentions";

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string };

// Función pura: parte `text` en segmentos de texto plano y mención,
// linkificando SOLO los usernames presentes en `known` (comparación
// case-insensitive, igual que el resto del pipeline de menciones). Un typo
// (@nadie) o un username borrado nunca produce un segmento "mention" — nunca
// hay un enlace muerto. Sin JSX: se testea directamente en Vitest sin
// depender de @testing-library/react (no está cableado en este proyecto).
export function tokenizeMentions(text: string, known: string[]): MentionSegment[] {
  const knownSet = new Set(known.map((u) => u.toLowerCase()));
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  MENTION_RE.lastIndex = 0; // MENTION_RE es global: reinicia el cursor en cada llamada.
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const prefix = m[1];
    const username = m[2];
    if (!knownSet.has(username.toLowerCase())) continue; // typo/desconocido: se queda fundido en el texto plano circundante
    const mentionStart = m.index + prefix.length;
    const mentionEnd = mentionStart + 1 + username.length; // incluye el "@"
    if (mentionStart > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, mentionStart) });
    }
    segments.push({ type: "mention", value: username });
    lastIndex = mentionEnd;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

// Renderiza texto libre linkificando @usuario SOLO si el username existe
// (knownUsernames, resuelto server-side por resolveKnownMentions). Un typo
// queda como texto plano — nunca un enlace muerto. Cliente-safe: no hace
// fetch, recibe el array ya resuelto (no un Set — no serializa a través del
// límite RSC→cliente).
export function MentionText({
  text,
  knownUsernames,
}: {
  text: string;
  knownUsernames: string[];
}) {
  const segments = tokenizeMentions(text, knownUsernames);
  return (
    <>
      {segments.map((s, i) =>
        s.type === "mention" ? (
          <Link
            key={i}
            href={`/u/${s.value.toLowerCase()}`}
            className="font-medium text-accent hover:underline"
          >
            @{s.value}
          </Link>
        ) : (
          <Fragment key={i}>{s.value}</Fragment>
        ),
      )}
    </>
  );
}
