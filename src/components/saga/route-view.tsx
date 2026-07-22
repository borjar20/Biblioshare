// Stub transitorio (Task 5): la implementación real llega en la Task 6.
// Renderiza null para que SagaMapTab compile mientras existe una ruta curada
// activa sin vista propia todavía.
// Nota: el brief de la Task 5 proponía un parámetro `_` sin desestructurar,
// pero el eslint de este repo no exime los identificadores con guion bajo de
// `no-unused-vars` (ver otros `_prevState`/`_userId` ya en warning) — de ahí
// los `void` para mantener la firma real sin generar un aviso nuevo.
export function RouteView({ detail, slug, canEdit }: { detail: unknown; slug: string; canEdit?: boolean }) {
  void detail;
  void slug;
  void canEdit;
  return null;
}
