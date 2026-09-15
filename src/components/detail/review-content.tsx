import { createElement, Fragment, type ReactNode } from "react";

function decode(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, name: string) => {
    if (!name.startsWith("#")) return named[name.toLowerCase()] ?? original;
    const point = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "�";
  });
}

/** Renders only basic formatting as React nodes. Never injects source HTML. */
export function ReviewContent({ text }: { text: string }) {
  if (!/<\/?(?:p|br|b|strong|i|em|a)\b/i.test(text)) return <span className="whitespace-pre-wrap">{text}</span>;
  const nodes: ReactNode[] = [];
  const stack: { tag: string; children: ReactNode[]; href?: string }[] = [{ tag: "span", children: nodes }];
  const clean = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  for (const token of clean.split(/(<[^>]*>)/g)) {
    const current = () => stack[stack.length - 1].children;
    if (!token.startsWith("<")) { current().push(decode(token)); continue; }
    const match = token.match(/^<(\/?)\s*(\w+)\b([^>]*)>/);
    if (!match) { current().push(token); continue; }
    const tag = match[2].toLowerCase();
    if (tag === "p" || tag === "br") {
      if (tag === "br" || match[1]) current().push(<br key={`br-${current().length}`} />);
      if (tag === "p" && match[1]) current().push(<br key={`p-${current().length}`} />);
      continue;
    }
    if (!["strong", "b", "em", "i", "a"].includes(tag)) continue;
    if (match[1]) {
      if (stack.length > 1 && stack[stack.length - 1].tag === tag) {
        const node = stack.pop()!;
        current().push(createElement(node.tag === "a" && !node.href ? "span" : node.tag,
          { key: `node-${current().length}`, ...(node.href ? { href: node.href, rel: "nofollow noopener noreferrer" } : {}) }, ...node.children));
      }
    } else if (stack.length < 20) {
      const raw = match[3].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      let href: string | undefined;
      if (tag === "a" && raw) {
        try { const url = new URL(decode(raw[1] ?? raw[2])); if (["https:", "http:"].includes(url.protocol)) href = url.href; } catch { /* Non-URLs remain text. */ }
      }
      stack.push({ tag, href, children: [] });
    }
  }
  while (stack.length > 1) { const node = stack.pop()!; stack[stack.length - 1].children.push(...node.children); }
  return <span className="whitespace-pre-wrap">{nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</span>;
}
