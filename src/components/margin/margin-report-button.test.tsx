// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const report = vi.fn();
vi.mock("@/lib/margin/report-actions", () => ({ reportMarginNote: (...a: unknown[]) => report(...a) }));

import { MarginReportButton } from "./margin-report-button";

function ui() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <MarginReportButton encounterId="e1" />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("MarginReportButton", () => {
  it("envía la denuncia y confirma", async () => {
    report.mockResolvedValue({ ok: true });
    ui();
    fireEvent.click(screen.getByText(messages.social.reportComment));
    fireEvent.click(screen.getByText(messages.social.sendReport));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(report).toHaveBeenCalledWith("e1", "spam", "");
  });

  it("muestra el error en un alert, tambien si ya estaba denunciada", async () => {
    report.mockResolvedValue({ ok: false, error: "duplicate" });
    ui();
    fireEvent.click(screen.getByText(messages.social.reportComment));
    fireEvent.click(screen.getByText(messages.social.sendReport));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(messages.social.actionError));
  });
});
