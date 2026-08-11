"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

const MAX_LENGTH = 2000;

// Envuelve la selección actual del textarea con `before`/`after` (o inserta
// un placeholder "texto" si no hay selección) y reposiciona el cursor tras la
// marca insertada. Puerto directo del `_wrap` del mockup CommentThread.dc.html
// -- produce el mismo markdown-lite que consume rich-text.ts (**negrita**,
// *cursiva*, "- " de lista).
function wrap(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (v: string) => void,
  before: string,
  after: string,
) {
  if (!el) {
    setValue(value + before + after);
    return;
  }
  const s = el.selectionStart || 0;
  const e = el.selectionEnd || 0;
  const inner = value.slice(s, e) || "texto";
  const nv = value.slice(0, s) + before + inner + after + value.slice(e);
  setValue(nv);
  const pos = s + before.length + inner.length + after.length;
  requestAnimationFrame(() => {
    el.focus();
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // el textarea pudo desmontarse entre el rAF y esta línea
    }
  });
}

// Compositor reutilizable para comentarios (Tarea 6): textarea controlado +
// contador (reutiliza las clases del textarea de review-interactions.tsx),
// barra de formato B/I/≡ que envuelve la selección con el markdown-lite de
// rich-text.ts, spoiler opcional y botón enviar. Sin estado propio de
// mención: `dropdown` es el hueco donde el caller (hilo en Tarea 7, chat en
// Tarea 8) monta su propio useMentionAutocomplete.
export function CommentComposer({
  value,
  onChange,
  onSubmit,
  onInput,
  onKeyDown,
  onCancel,
  dropdown,
  submitLabel,
  placeholder,
  isSpoiler = false,
  onToggleSpoiler,
  showFormatting,
  busy = false,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onInput?: React.FormEventHandler<HTMLTextAreaElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onCancel?: () => void;
  dropdown?: React.ReactNode;
  submitLabel: string;
  placeholder: string;
  isSpoiler?: boolean;
  onToggleSpoiler?: () => void;
  showFormatting?: boolean;
  busy?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("social");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formatting = showFormatting ?? !compact;

  function applyWrap(before: string, after: string) {
    wrap(textareaRef.current, value, onChange, before, after);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {(formatting || onToggleSpoiler) && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {formatting && (
            <>
              <button
                type="button"
                aria-label={t("formatBold")}
                onClick={() => applyWrap("**", "**")}
                className="grid h-7 w-7 place-items-center rounded-md font-bold hover:bg-surface-muted hover:text-foreground"
              >
                B
              </button>
              <button
                type="button"
                aria-label={t("formatItalic")}
                onClick={() => applyWrap("*", "*")}
                className="grid h-7 w-7 place-items-center rounded-md italic hover:bg-surface-muted hover:text-foreground"
              >
                I
              </button>
              <button
                type="button"
                aria-label={t("formatList")}
                onClick={() => applyWrap("\n- ", "")}
                className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-muted hover:text-foreground"
              >
                ≡
              </button>
            </>
          )}
          {onToggleSpoiler && (
            <button
              type="button"
              aria-label={t("spoiler")}
              aria-pressed={isSpoiler}
              onClick={onToggleSpoiler}
              className={`ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                isSpoiler
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {t("spoiler")}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            maxLength={MAX_LENGTH}
            rows={compact ? 1 : 2}
            onChange={(e) => onChange(e.target.value)}
            onInput={onInput}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={
              compact
                ? "w-full resize-none rounded-xl border border-border bg-surface px-2.5 py-1.5 pr-12 text-xs outline-none focus:border-accent"
                : "w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 pr-12 text-xs outline-none focus:border-accent"
            }
          />
          <span className="pointer-events-none absolute right-2 bottom-1.5 font-mono text-[9px] text-muted-foreground">
            {value.length}/{MAX_LENGTH}
          </span>
          {dropdown}
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          className="shrink-0 text-xs font-medium text-accent disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
