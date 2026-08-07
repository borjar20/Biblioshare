"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createThought, searchAnchorsAction } from "@/lib/social/thought-actions";
import type { AnchorRef } from "@/lib/catalog/anchor";
import { Button } from "@/components/ui/button";

const MAX_BODY = 2000;

// Formulario de «Pensamiento» (Fase 4, Task 4.3): ancla obligatoria (nunca se
// publica sin ella, la spec es explícita), cuerpo con contador y una barra
// markdown-lite (negrita/cursiva/lista, mismo micro-formato que soportará
// ThoughtCard en Fase 5), y spoiler opcional. `onDone` cierra el modal que lo
// aloja (thought-composer-trigger.tsx) -- este componente no sabe que vive en
// un <dialog>.
export function ThoughtComposer({ onDone }: { onDone: () => void }) {
  const t = useTranslations("thoughtComposer");
  const [anchor, setAnchor] = useState<AnchorRef | null>(null);
  const [anchorQuery, setAnchorQuery] = useState("");
  const [anchorResults, setAnchorResults] = useState<AnchorRef[]>([]);
  const [body, setBody] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounce del autocompletar, mismo patrón que SagaPicker
  // (src/components/saga-picker.tsx): 300ms tras la última tecla. El vaciado
  // al borrar la búsqueda se hace en el onChange del input, no aquí: llamar a
  // setState directamente en el CUERPO del efecto es un error de lint
  // (react-hooks/set-state-in-effect) -- el `setAnchorResults` de abajo vive
  // dentro del callback async de `.then()`, no en el cuerpo, así que no cuenta.
  useEffect(() => {
    const query = anchorQuery.trim();
    if (!query) return;
    const handle = setTimeout(() => {
      searchAnchorsAction(query).then(setAnchorResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [anchorQuery]);

  function wrapSelection(before: string, after: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + before + body.slice(start, end) + after + body.slice(end);
    setBody(next.slice(0, MAX_BODY));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  }

  function prefixLine() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const lineStart = body.lastIndexOf("\n", start - 1) + 1;
    const next = body.slice(0, lineStart) + "- " + body.slice(lineStart);
    setBody(next.slice(0, MAX_BODY));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 2, start + 2);
    });
  }

  function publish() {
    if (!anchor) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await createThought({
        anchorType: anchor.type,
        anchorId: anchor.id,
        body,
        isSpoiler,
      });
      if (result.ok) {
        onDone();
      } else {
        setError(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {t("anchorLabel")}
        </span>
        {anchor ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
            <div className="relative h-9 w-7 shrink-0 overflow-hidden rounded bg-surface-muted">
              {anchor.imageUrl && (
                <Image src={anchor.imageUrl} alt="" fill sizes="28px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{anchor.title}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(`anchorType.${anchor.type}`)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAnchor(null)}
              aria-label={t("anchorClear")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <input
              type="search"
              value={anchorQuery}
              onChange={(e) => {
                setAnchorQuery(e.target.value);
                if (!e.target.value.trim()) setAnchorResults([]);
              }}
              placeholder={t("anchorPlaceholder")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {anchorQuery.trim() && (
              <div className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border">
                {anchorResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t("anchorEmpty")}</p>
                ) : (
                  anchorResults.map((result) => (
                    <button
                      key={`${result.type}:${result.id}`}
                      type="button"
                      onClick={() => {
                        setAnchor(result);
                        setAnchorQuery("");
                        setAnchorResults([]);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-muted"
                    >
                      <div className="relative h-9 w-7 shrink-0 overflow-hidden rounded bg-surface-muted">
                        {result.imageUrl && (
                          <Image src={result.imageUrl} alt="" fill sizes="28px" className="object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{result.title}</p>
                        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t(`anchorType.${result.type}`)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button
          type="button"
          aria-label={t("boldLabel")}
          onClick={() => wrapSelection("**", "**")}
          className="grid h-7 w-7 place-items-center rounded-md font-bold hover:bg-surface-muted hover:text-foreground"
        >
          B
        </button>
        <button
          type="button"
          aria-label={t("italicLabel")}
          onClick={() => wrapSelection("*", "*")}
          className="grid h-7 w-7 place-items-center rounded-md italic hover:bg-surface-muted hover:text-foreground"
        >
          I
        </button>
        <button
          type="button"
          aria-label={t("listLabel")}
          onClick={prefixLine}
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-muted hover:text-foreground"
        >
          •
        </button>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          maxLength={MAX_BODY}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span className="pointer-events-none absolute bottom-2 right-2.5 font-mono text-[10px] text-muted-foreground">
          {body.length}/{MAX_BODY}
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isSpoiler}
          onChange={(e) => setIsSpoiler(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        {t("spoilerLabel")}
      </label>

      {error && (
        <p role="alert" className="text-xs text-status-dropped">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={isPending || !anchor || !body.trim()}
          onClick={publish}
        >
          {t("publish")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
