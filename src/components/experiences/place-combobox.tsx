"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { PlaceSuggestion } from "@/lib/places/types";

type Chosen = { name: string; token: string | null }; // token null = linked place kept as-is
type Props = { id: string; defaultLabel?: string | null; linked?: boolean };

// ARIA 1.2 combobox (list autocomplete). Free text is the default; a suggestion turns
// the field into a chip whose name is the official one (spec §5).
export function PlaceCombobox({ id, defaultLabel, linked = false }: Props) {
  const t = useTranslations("experiences.places"), listId = useId();
  const [text, setText] = useState(linked ? "" : defaultLabel ?? "");
  const [chosen, setChosen] = useState<Chosen | null>(linked ? { name: defaultLabel ?? "", token: null } : null);
  const [items, setItems] = useState<PlaceSuggestion[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null), refocus = useRef(false), removeBtn = useRef<HTMLButtonElement>(null), focusChip = useRef(false), focused = useRef(false);

  useEffect(() => {
    if (chosen) return;
    const q = text.trim();
    if (q.length < 3) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`, { signal: abort.signal });
        const body = res.ok ? await res.json() as { items?: PlaceSuggestion[] } : { items: [] };
        const next = Array.isArray(body.items) ? body.items : [];
        setItems(next); setOpen(next.length > 0 && focused.current); setActive(-1);
      } catch { if (!abort.signal.aborted) { setItems([]); setOpen(false); } }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [text, chosen]);

  useEffect(() => { if (!chosen && refocus.current) { refocus.current = false; input.current?.focus(); } }, [chosen]);

  // The input unmounts on choose; park focus on the chip's remove button instead of <body>.
  useEffect(() => { if (chosen && focusChip.current) { focusChip.current = false; removeBtn.current?.focus(); } }, [chosen]);

  const choose = (item: PlaceSuggestion) => { focusChip.current = true; setChosen({ name: item.name, token: item.token }); setOpen(false); setItems([]); };
  const clear = () => { refocus.current = true; setChosen(null); setText(""); };

  if (chosen) return <div id={id} role="group" aria-label={t("chosen", { name: chosen.name })} className="flex min-h-11 items-center">
    <input type="hidden" name="placeLabel" value={chosen.name}/>
    {chosen.token ? <input type="hidden" name="placeToken" value={chosen.token}/> : <input type="hidden" name="keepPlace" value="true"/>}
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface-muted py-0 pl-3 pr-0 text-sm">
      <span className="truncate">{chosen.name}</span>
      <button ref={removeBtn} type="button" onClick={clear} aria-label={t("remove", { name: chosen.name })} className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">✕</button>
    </span>
  </div>;

  const shown = open && items.length > 0 && text.trim().length >= 3;
  const optionId = (index: number) => `${listId}-${index}`;
  return <div className="relative">
    <Input ref={input} id={id} name="placeLabel" value={text} maxLength={240} autoComplete="off" className="min-h-11 w-full"
      role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={listId} aria-describedby={`${listId}-hint`}
      aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
      onFocus={() => { focused.current = true; }}
      onChange={(event) => { const v = event.target.value; setText(v); if (v.trim().length < 3) { setItems([]); setOpen(false); } }}
      onBlur={() => { focused.current = false; setOpen(false); }}
      onKeyDown={(event) => {
        if (!shown) {
          if (event.key === "ArrowDown" && items.length > 0 && text.trim().length >= 3) { event.preventDefault(); setOpen(true); }
          return;
        }
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % items.length); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
        else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(items[active]); }
        else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      }}/>
    <p id={`${listId}-hint`} className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
    {shown && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-cover">
      <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
        {items.map((item, index) => <li key={item.token} id={optionId(index)} role="option" aria-selected={index === active}
          onMouseDown={(event) => { event.preventDefault(); choose(item); }}
          className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 text-sm ${index === active ? "bg-surface-muted" : ""}`}>
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">{[t(`layers.${item.layer}`), item.subtitle].filter(Boolean).join(" · ")}</span>
        </li>)}
      </ul>
      <p className="border-t border-border px-3 py-1 text-right text-[11px] text-muted-foreground">{t("attribution")}</p>
    </div>}
  </div>;
}
