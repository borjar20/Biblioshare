// Parser markdown-lite puro para el cuerpo de un Pensamiento (Fase 5, Task
// 5.1). Sin dependencias de React: se testea directamente en Vitest, igual
// que `tokenizeMentions` (mention-text.tsx). Soporta el mismo micro-formato
// que la barra del compositor (thought-composer.tsx): `**negrita**`,
// `*cursiva*`, `- lista` y `@mención` (la linkificación real de la mención
// contra `knownUsernames` es cosa de RichTextView, no de este módulo — aquí
// solo se reconoce el token).
export type Segment =
  | { kind: "plain"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "mention"; text: string }; // incluye la @
export type Line = { isList: boolean; segments: Segment[] };

const LIST_PREFIX_RE = /^\s*-\s+/;
// Un token sin cerrar (p.ej. "**a" sin "**" final) simplemente no casa con
// ningún grupo de la alternancia -- el bucle de abajo lo deja caer al texto
// plano circundante, así que no hace falta lógica aparte para el caso "unclosed".
const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|@[A-Za-z0-9_]+)/g;

export function parseRichText(input: string): Line[] {
  return input.split("\n").map(parseLine);
}

function parseLine(rawLine: string): Line {
  const isList = LIST_PREFIX_RE.test(rawLine);
  const text = isList ? rawLine.replace(LIST_PREFIX_RE, "") : rawLine;

  if (text === "") return { isList, segments: [{ kind: "plain", text: "" }] };

  const segments: Segment[] = [];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0; // TOKEN_RE es global: reinicia el cursor en cada línea.
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ kind: "plain", text: text.slice(lastIndex, m.index) });
    }
    const token = m[0];
    if (token.startsWith("**")) segments.push({ kind: "bold", text: token.slice(2, -2) });
    else if (token.startsWith("*")) segments.push({ kind: "italic", text: token.slice(1, -1) });
    else segments.push({ kind: "mention", text: token });
    lastIndex = m.index + token.length;
  }
  if (lastIndex < text.length) segments.push({ kind: "plain", text: text.slice(lastIndex) });

  return { isList, segments };
}
