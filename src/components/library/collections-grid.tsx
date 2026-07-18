import { createClient } from "@/lib/supabase/server";
import { listCollections } from "@/lib/library/collections";
import { CollectionCard } from "./collection-card";
import { NewCollectionTile } from "./new-collection-tile";

// Grid de Colecciones (frame A, default de Mi Biblioteca). Sin colecciones,
// queda solo el tile de crear — no hay estado vacío aparte, el propio tile
// invita a la primera acción.
export async function CollectionsGrid({ userId }: { userId: string }) {
  const supabase = await createClient();
  const cards = await listCollections(supabase, userId);

  return (
    <div className="grid grid-cols-2 gap-3.5">
      {cards.map((card) => (
        <CollectionCard key={card.id} card={card} />
      ))}
      <NewCollectionTile />
    </div>
  );
}
