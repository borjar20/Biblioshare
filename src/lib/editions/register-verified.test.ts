import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), book: vi.fn(), editions: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createPublicClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.book }) }) }),
}) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/catalog/openlibrary/editions", () => ({
  fetchLiveWorkEditions: h.editions, EDITIONS_PAGE_SIZE: 100, MAX_REPRESENTATION_PAGES: 2,
}));
import { registerVerifiedBookEdition } from "./register-verified";

describe("registro de edición verificada", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    h.book.mockResolvedValue({ data: { openlibrary_work_key: "/works/OL1W" }, error: null });
    h.editions.mockResolvedValue([{ isbn: "9788410138407", label: "Edición", publisher: "Proveedor",
      year: 2024, totalPages: 200, coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg" }]);
    h.rpc.mockResolvedValue({ data: "edition-1", error: null });
  });
  it("persiste metadatos del proveedor con la identidad del llamante autenticado", async () => {
    expect(await registerVerifiedBookEdition("book-1", "9788410138407", "user-1")).toBe("edition-1");
    expect(h.editions).toHaveBeenCalledWith("/works/OL1W", 200);
    expect(h.rpc).toHaveBeenCalledWith("register_verified_book_edition", {
      p_book_id: "book-1", p_created_by: "user-1", p_isbn: "9788410138407", p_label: "Edición",
      p_publisher: "Proveedor", p_year: 2024, p_pages: 200,
      p_cover_url: "https://covers.openlibrary.org/b/id/1-M.jpg",
    });
  });
  it("no registra un ISBN que el proveedor no vincula a esta obra", async () => {
    h.editions.mockResolvedValue([]);
    expect(await registerVerifiedBookEdition("book-1", "9788410138407", "user-1")).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("no inventa una edición para una obra sin identificador verificado", async () => {
    h.book.mockResolvedValue({ data: { openlibrary_work_key: null }, error: null });
    expect(await registerVerifiedBookEdition("book-1", "9788410138407", "user-1")).toBeNull();
    expect(h.editions).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("propaga un fallo de lectura sin confundirlo con una obra ausente", async () => {
    h.book.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(registerVerifiedBookEdition("book-1", "9788410138407", "user-1")).rejects.toThrow("unavailable");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
