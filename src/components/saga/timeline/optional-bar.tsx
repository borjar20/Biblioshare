import { setShowOptionalReadings } from "@/lib/sagas/optional-actions";

// La `optbar` del mockup con su interruptor (estado 03).
//
// Se pinta SIEMPRE que la saga tenga alguna obra opcional y haya sesión —
// también, y sobre todo, cuando están escondidas. Es lo único que permite
// volver a verlas, y con ellas los saltos: saltar TACHA (la fila sigue ahí, con
// su «Deshacer»), el interruptor ESCONDE. Con el interruptor apagado un salto
// no se puede deshacer desde la fila, porque la fila no está.
//
// Por eso `hasOptional` se calcula sobre el grafo y no sobre las filas
// visibles: calculado sobre lo visible, apagar el interruptor haría desaparecer
// el propio interruptor y no habría forma de volver.
export function OptionalBar({
  sagaId,
  showOptional,
  count,
  labels,
}: {
  sagaId: string;
  showOptional: boolean;
  /** Cuántas opcionales tiene la saga. Con el interruptor apagado es lo único
   *  que dice qué se está perdiendo el lector. */
  count: number;
  labels: { title: string; show: string; hide: string; count: (n: number) => string };
}) {
  return (
    <div
      data-testid="optional-bar"
      className="my-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.08] px-3 py-2.5"
    >
      <span aria-hidden className="text-gold">
        ↳
      </span>
      <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
        {showOptional ? labels.title : labels.count(count)}
      </p>
      <form action={setShowOptionalReadings.bind(null, !showOptional, sagaId)}>
        <button
          type="submit"
          data-testid="toggle-optional"
          aria-pressed={showOptional}
          className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground"
        >
          {showOptional ? labels.hide : labels.show}
        </button>
      </form>
    </div>
  );
}
