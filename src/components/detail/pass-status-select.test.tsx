// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { PassStatusSelect } from "./pass-status-select";

afterEach(cleanup);

function Harness({
  itemType,
  initial,
  onChange,
  disabled,
}: {
  itemType: ItemType;
  initial: MediaStatus;
  onChange?: (s: MediaStatus) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  return (
    <NextIntlClientProvider locale="es" messages={messages}>
      <PassStatusSelect
        status={status}
        itemType={itemType}
        disabled={disabled}
        onChange={(next) => {
          onChange?.(next);
          setStatus(next);
        }}
      />
    </NextIntlClientProvider>
  );
}
describe("selector de estado del pase", () => {
  it("mantiene accesible el estado heredado de una película en curso", () => {
    render(<Harness itemType="movie" initial="in_progress" />);
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "in_progress");
  });

  it("permite elegir entre los tres estados de una película", () => {
    const onChange = vi.fn();
    render(<Harness itemType="movie" initial="planned" onChange={onChange} />);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "completed" } });
    expect(onChange).toHaveBeenCalledWith("completed");
  });
});
