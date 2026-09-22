// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => replace(...args) }),
  usePathname: () => pathname,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
const deletePost = vi.fn();
vi.mock("@/lib/social/post-actions", () => ({
  deletePost: (...args: unknown[]) => deletePost(...args),
}));

import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";

function Harness({ postId }: { postId: string | null }) {
  const { deleted, error, pending, requestDelete } = useDeletePost(postId);
  if (deleted) return <p>tarjeta oculta</p>;
  return (
    <div>
      <PostDeleteMenu onDelete={requestDelete} pending={pending} />
      {error && <PostDeleteError />}
    </div>
  );
}

function clickDelete() {
  fireEvent.click(screen.getByRole("button", { name: "postMenu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "postDelete" }));
}

beforeEach(() => {
  pathname = "/";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockReset();
  deletePost.mockReset();
});

describe("useDeletePost + PostDeleteMenu", () => {
  it("cancelar el confirm no llama a deletePost", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness postId="p1" />);
    clickDelete();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("confirmar borra y oculta la tarjeta solo tras ok:true", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePost.mockResolvedValue({ ok: true });
    render(<Harness postId="p1" />);
    clickDelete();
    expect(deletePost).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(screen.getByText("tarjeta oculta")).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("si falla, la tarjeta se queda y avisa en línea", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePost.mockResolvedValue({ ok: false, error: "not_allowed_or_missing" });
    render(<Harness postId="p1" />);
    clickDelete();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("postDeleteError"));
    expect(screen.queryByText("tarjeta oculta")).toBeNull();
  });

  it("en /post/[id] del propio post redirige a Inicio en vez de ocultar", async () => {
    pathname = "/post/p1";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePost.mockResolvedValue({ ok: true });
    render(<Harness postId="p1" />);
    clickDelete();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("sin postId no pregunta ni borra", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<Harness postId={null} />);
    clickDelete();
    expect(confirm).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });
});
