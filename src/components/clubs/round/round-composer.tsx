"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ItemPicker, type PickedItem } from "@/components/clubs/item-picker";
import { proposeRound } from "@/lib/clubs/rounds/rounds";
import { buttonVariants } from "@/components/ui/button";

// Estado 01 de la maqueta: te toca a ti. La obra va DETRÁS de un botón -- la
// mayoría de rondas serán solo pregunta, y un selector siempre visible
// convierte un campo en un formulario.
export function RoundComposer({ clubId }: { clubId: string }) {
  const t = useTranslations("club.round");
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [item, setItem] = useState<PickedItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await proposeRound(
          clubId,
          prompt,
          item ? { itemType: item.itemType, itemId: item.itemId } : null,
        );
        if (!result.ok) {
          // round_already_open (llegaste tarde) y not_your_turn (no eres el
          // titular) comparten copia: para quien escribe, las dos dicen "se
          // te pasó el turno". Viajan como resultado discriminado, no como
          // throw -- ver el comentario de ProposeRoundResult en rounds.ts.
          setError(t("errorNotYourTurn"));
          // El composer se quedaba pintado como si aún fuera tu turno,
          // encima de una ronda que ya existe (la de quien se adelantó). El
          // texto se queda en el estado -- no se pierde, se puede copiar --
          // pero la página necesita refrescar para que round-block.tsx vea
          // el `round` ya escrito y deje de ofrecer el composer.
          router.refresh();
          return;
        }
        setPrompt("");
        setItem(null);
      } catch {
        // Lo inesperado (sesión caída, red, otro fallo de la RPC) sí sigue
        // lanzando: no hay copia específica que ofrecer para eso.
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-dashed border-accent/45 bg-accent/5 p-3.5">
      <p className="font-serif text-base font-semibold">{t("yourTurnTitle")}</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("yourTurnPlaceholder")}
        aria-label={t("yourTurnTitle")}
        maxLength={500}
        rows={3}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
      />
      {item && <p className="text-sm text-muted-foreground">{item.title}</p>}
      {pickerOpen && (
        <ItemPicker
          onPick={(picked) => {
            setItem(picked);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !prompt.trim()}
          onClick={submit}
          className={buttonVariants("primary")}
        >
          {t("yourTurnSubmit")}
        </button>
        {!item && !pickerOpen && (
          <button type="button" onClick={() => setPickerOpen(true)} className={buttonVariants("secondary")}>
            {t("yourTurnAddWork")}
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{t("yourTurnDeadline")}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-dropped">
          {error}
        </p>
      )}
    </div>
  );
}
