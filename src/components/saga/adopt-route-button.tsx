import { adoptRoute, dropRoute } from "@/lib/sagas/route-actions";

// Server Component con dos <form>: sin JS de cliente, como el resto de
// acciones simples de la ficha.
export function AdoptRouteButton({
  sagaId,
  slug,
  adopted,
  labels,
}: {
  sagaId: string;
  slug: string;
  adopted: boolean;
  labels: { adopt: string; adopted: string };
}) {
  const action = adopted ? dropRoute.bind(null, sagaId) : adoptRoute.bind(null, sagaId, slug);
  return (
    <form action={action}>
      <button
        type="submit"
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
          adopted ? "bg-surface-muted text-muted-foreground" : "bg-foreground text-background"
        }`}
      >
        {adopted ? labels.adopted : labels.adopt}
      </button>
    </form>
  );
}
