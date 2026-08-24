"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchMentionCandidates } from "@/lib/social/mention-search";
import type { MentionCandidate, MentionScope } from "@/lib/social/mention-candidates";

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

// Alto máximo que se le concede a la lista cuando hay sitio de sobra.
const ALTO_MAXIMO = 240;
// Aire entre la lista y el borde de la pantalla.
const MARGEN = 8;

type Colocacion = { lado: "arriba" | "abajo"; altoMaximo: number };

// Decide si la lista se abre hacia abajo o hacia arriba, y con qué alto. Sin
// esto la lista se pintaba SIEMPRE debajo del campo, y en móvil el composer va
// pegado al borde inferior de la pantalla (`fixed bottom-0` en el hilo,
// `sticky bottom-0` en el chat de club): la lista nacía fuera de la pantalla y
// era invisible. Se elige el lado con más hueco y el alto se recorta a ese
// hueco, así que la caja no puede salirse por ningún borde.
function medirColocacion(anchor: HTMLElement | null): Colocacion {
  if (!anchor || typeof window === "undefined") return { lado: "abajo", altoMaximo: ALTO_MAXIMO };
  const rect = anchor.getBoundingClientRect();
  const abajo = window.innerHeight - rect.bottom - MARGEN;
  const arriba = rect.top - MARGEN;
  // Solo se voltea si abajo NO cabe y arriba hay más sitio: en los composers a
  // media página (ficha, sheet de cierre) debe seguir abriéndose hacia abajo.
  const lado = abajo < Math.min(ALTO_MAXIMO, arriba) ? "arriba" : "abajo";
  const hueco = lado === "arriba" ? arriba : abajo;
  return { lado, altoMaximo: Math.max(0, Math.min(ALTO_MAXIMO, hueco)) };
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
  const [colocacion, setColocacion] = useState<Colocacion>({ lado: "abajo", altoMaximo: ALTO_MAXIMO });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El campo que disparó la búsqueda. Es el ancla que se mide: el hook no lo
  // recibe por props, lo toma del evento (así ningún caller tiene que pasar ref).
  const anchor = useRef<HTMLElement | null>(null);

  const runSearch = useCallback(
    (query: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const results = await searchMentionCandidates(query, scope);
        // Se mide justo antes de montar la lista, no en un efecto posterior: el
        // teclado del móvil cambia el alto del viewport, y así el primer pintado
        // ya sale colocado (sin salto visible).
        setColocacion(medirColocacion(anchor.current));
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
      anchor.current = el;
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
      <ul
        data-mention-list
        style={{ maxHeight: colocacion.altoMaximo }}
        className={`absolute left-0 z-20 w-56 max-w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg ${
          colocacion.lado === "arriba" ? "bottom-full mb-1" : "top-full mt-1"
        }`}
      >
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
