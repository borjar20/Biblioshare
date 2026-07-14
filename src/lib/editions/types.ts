export type Edition = {
  id: string;
  label: string;
  publisher: string | null;
  year: number | null;
  language: string | null;
  /** Páginas en libro, minutos en película. */
  totalUnits: number | null;
  isbn: string | null;
  coverUrl: string | null;
  isPrimary: boolean;
};
