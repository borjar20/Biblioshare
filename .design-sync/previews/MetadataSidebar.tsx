import { MetadataSidebar } from "@/components/detail/metadata-sidebar";

export function Default() {
  return (
    <div className="w-64">
      <MetadataSidebar
        rows={[
          { label: "Autor", value: "Patrick Rothfuss" },
          { label: "Editorial", value: "Plaza & Janés" },
          { label: "Páginas", value: "662" },
          { label: "Publicado", value: "2007" },
        ]}
        genres={["Fantasía", "Aventura"]}
        genresLabel="Géneros"
      />
    </div>
  );
}

export function WithoutGenres() {
  return (
    <div className="w-64">
      <MetadataSidebar
        rows={[
          { label: "Director", value: "Denis Villeneuve" },
          { label: "Duración", value: "166 min" },
        ]}
        genresLabel="Géneros"
      />
    </div>
  );
}
