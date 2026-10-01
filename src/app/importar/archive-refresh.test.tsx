// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveRefresh } from "./archive-refresh";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("ArchiveRefresh", () => {
  it("dispatches once per mounted job and keeps the relative session request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const id = "6e04e8c3-9126-4d03-b4b5-0641f1ea3c80";
    const view = render(<ArchiveRefresh jobId={id} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(<ArchiveRefresh jobId={id} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/import/archive/${id}/dispatch`, {
      method: "POST", credentials: "same-origin",
    });
  });

  it("does not refresh after the component unmounts while dispatch is in flight", async () => {
    let resolveResponse: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const view = render(<ArchiveRefresh jobId="6e04e8c3-9126-4d03-b4b5-0641f1ea3c80" />);

    view.unmount();
    resolveResponse!(new Response(null, { status: 200 }));
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes instead of reporting the expected not-found completion race", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<ArchiveRefresh jobId="6e04e8c3-9126-4d03-b4b5-0641f1ea3c80" />);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(error).not.toHaveBeenCalled();
  });
});
