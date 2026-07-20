import { SagaStrip } from "@/components/detail/saga-strip";
import type { SagaMember } from "@/lib/sagas/types";

const COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMDM2OWExIi8+PC9zdmc+";

const members: SagaMember[] = [
  { itemType: "movie", itemId: "m-1", title: "El señor de los anillos: La comunidad del anillo", coverUrl: COVER, href: "/pelicula/m-1", position: 1 },
  { itemType: "movie", itemId: "m-2", title: "El señor de los anillos: Las dos torres", coverUrl: COVER, href: "/pelicula/m-2", position: 2 },
  { itemType: "movie", itemId: "m-3", title: "El señor de los anillos: El retorno del rey", coverUrl: null, href: "/pelicula/m-3", position: 3 },
];

export function Default() {
  return (
    <SagaStrip
      members={members}
      currentType="movie"
      currentId="m-2"
      sagaId="saga-1"
      sagaName="El señor de los anillos"
      positionLabel="nº 2 de 3"
    />
  );
}
