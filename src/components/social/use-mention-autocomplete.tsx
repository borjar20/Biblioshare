"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchMentionCandidates } from "@/lib/social/mention-search";
import type { MentionCandidate, MentionScope } from "@/lib/social/mention-search";

// Detecta el token @… que contiene el cursor. Devuelve null si no hay uno
// activo (no hay @, hay espacio entre el @ y el cursor, o el @ va pegado a un
// carácter de palabra — email/ruta). Puro: testeable sin DOM.
export function findActiveMentionToken(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const before = at === 0 ? "" : upto[at - 1];
  if (before && /[a-z0-9_@/]/i.test(before)) return null; // email/ruta
  const query = upto.slice(at + 1);
  if (!/^[a-z0-9_]*$/i.test(query)) return null; // hay espacio/símbolo → cerrado
  return { query, start: at };
}

export function useMentionAutocomplete(opts: {
  value: string;
  onChange: (next: string) => void;
  scope: MentionScope;
}) {
  const { value, onChange, scope } = opts;
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [active, setActive] = useState(0);
  const [token, setToken] = useState<{ query: string; start: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    (query: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const results = await searchMentionCandidates(query, scope);
        setCandidates(results);
        setActive(0);
      }, 150);
    },
    [scope],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onInput = useCallback(
    (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const found = findActiveMentionToken(el.value, el.selectionStart ?? el.value.length);
      setToken(found);
      if (found && found.query.length >= 1) runSearch(found.query);
      else setCandidates([]);
    },
    [runSearch],
  );

  const pick = useCallback(
    (c: MentionCandidate) => {
      if (!token) return;
      const before = value.slice(0, token.start);
      const after = value.slice(token.start + 1 + token.query.length);
      onChange(`${before}@${c.username} ${after}`);
      setCandidates([]);
      setToken(null);
    },
    [token, value, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (candidates.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % candidates.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + candidates.length) % candidates.length); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(candidates[active]); }
      else if (e.key === "Escape") { setCandidates([]); setToken(null); }
    },
    [candidates, active, pick],
  );

  const dropdown =
    candidates.length > 0 ? (
      <ul className="absolute z-20 mt-1 max-h-60 w-56 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
        {candidates.map((c, i) => (
          <li key={c.username}>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                i === active ? "bg-accent/10 text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="font-medium">@{c.username}</span>
              {c.displayName && <span className="truncate text-xs text-muted-foreground">{c.displayName}</span>}
              {c.isInGraph && <span className="ml-auto text-[10px] text-accent">sigues</span>}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return { onInput, onKeyDown, dropdown };
}
