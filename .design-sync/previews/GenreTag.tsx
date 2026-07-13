import { GenreTag } from "@/components/ui/genre-tag";

export function Default() {
  return <GenreTag label="Fantasía" />;
}

export function List() {
  return (
    <div className="flex flex-wrap gap-1.5">
      <GenreTag label="Fantasía" />
      <GenreTag label="Aventura" />
      <GenreTag label="Clásico" />
    </div>
  );
}
