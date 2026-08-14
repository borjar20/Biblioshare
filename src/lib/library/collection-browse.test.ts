import { describe, expect, it } from "vitest";
import { browseCollections } from "./collection-browse";
import type { CollectionCard } from "./collections";

function card(over: Partial<CollectionCard> & { name: string }): CollectionCard {
  return {
    id: over.name,
    count: 0,
    fanCovers: [],
    dominantType: null,
    typeCounts: {},
    updatedAt: "2026-01-01T00:00:00Z",
    position: 0,
    description: null,
    isSorteable: false,
    ...over,
  };
}

const CARDS: CollectionCard[] = [
  card({ name: "Zombis", count: 3, position: 2, updatedAt: "2026-03-01T00:00:00Z" }),
  card({ name: "Ansible", count: 10, position: 1, updatedAt: "2026-01-15T00:00:00Z" }),
  card({ name: "Manga", count: 7, position: 1, updatedAt: "2026-05-20T00:00:00Z" }),
];

const names = (cards: CollectionCard[]) => cards.map((c) => c.name);

describe("browseCollections · orden", () => {
  it("name: alfabético", () => {
    expect(names(browseCollections(CARDS, "", "name"))).toEqual([
      "Ansible",
      "Manga",
      "Zombis",
    ]);
  });

  it("size: más títulos primero", () => {
    expect(names(browseCollections(CARDS, "", "size"))).toEqual([
      "Ansible",
      "Manga",
      "Zombis",
    ]);
  });

  it("recent: updated_at descendente, ignorando position", () => {
    expect(names(browseCollections(CARDS, "", "recent"))).toEqual([
      "Manga",
      "Zombis",
      "Ansible",
    ]);
  });

  // El caso que de verdad se rompe al tocar esto: con `position` empatada, lo
  // que decide es la fecha — y en sentido DESCENDENTE.
  it("custom: position asc, y con position empatada gana la más reciente", () => {
    expect(names(browseCollections(CARDS, "", "custom"))).toEqual([
      "Manga", // position 1, tocada en mayo
      "Ansible", // position 1, tocada en enero
      "Zombis", // position 2
    ]);
  });
});

describe("browseCollections · búsqueda", () => {
  it("insensible a mayúsculas y a espacios de los bordes", () => {
    expect(names(browseCollections(CARDS, "  mAn ", "name"))).toEqual(["Manga"]);
  });

  it("busca en cualquier parte del nombre, no solo al principio", () => {
    expect(names(browseCollections(CARDS, "sib", "name"))).toEqual(["Ansible"]);
  });

  it("sin coincidencias devuelve vacío, no la lista entera", () => {
    expect(browseCollections(CARDS, "xyz", "name")).toEqual([]);
  });

  it("la consulta vacía no filtra nada", () => {
    expect(browseCollections(CARDS, "   ", "name")).toHaveLength(3);
  });
});

describe("browseCollections · pureza", () => {
  // `cards` es una prop de React: si `sort` mutara el array de entrada, el
  // componente se reordenaría a sí mismo entre renders.
  it("no muta ni reordena el array de entrada", () => {
    const input = [...CARDS];
    browseCollections(input, "", "name");
    expect(names(input)).toEqual(["Zombis", "Ansible", "Manga"]);
  });
});
