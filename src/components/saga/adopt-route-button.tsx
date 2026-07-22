// Stub transitorio (Task 6): la implementación real llega en la Task 7.
// Renderiza null para que RouteView compile con la firma que consumirá el
// botón de adoptar ruta. Mismo patrón de `void` que el stub de RouteView en la
// Task 5: el eslint de este repo no exime los identificadores con guion bajo
// de `no-unused-vars`, así que hay que desestructurar y consumir cada prop.
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
  void sagaId;
  void slug;
  void adopted;
  void labels;
  return null;
}
