// Placeholder de la tira de ediciones mientras se sincronizan desde OpenLibrary
// en la primera visita (va como fallback del <Suspense> en EditionsSection).
export function EditionsLoading() {
  return (
    <div className="flex gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 w-20 shrink-0 animate-pulse rounded-cover bg-surface-muted"
        />
      ))}
    </div>
  );
}
