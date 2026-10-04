// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

function provider(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={{ nav: { changeTheme: "Change theme" } }}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  document.documentElement.classList.remove("dark", "light");
  localStorage.removeItem("theme");
});
afterEach(cleanup);

describe("ThemeToggle", () => {
  it("uses the current locale and persists both theme directions", () => {
    render(provider(<ThemeToggle />));
    const toggle = screen.getByRole("button", { name: "Change theme" });
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("dark");
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("keeps the icon accurate when another mounted toggle changes theme", async () => {
    render(provider(
      <>
        <ThemeToggle />
        <ThemeToggle variant="menu" />
      </>,
    ));
    const desktop = screen.getByRole("button", { name: "Change theme" });
    const mobile = screen.getByRole("menuitem", { name: "Change theme" });
    expect(desktop.querySelector("circle")).toBeNull();
    fireEvent.click(mobile);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // Dark mode offers the sun; the desktop toggle must follow the menu toggle
    // before a viewport change makes that previously hidden control visible.
    await waitFor(() => expect(desktop.querySelector("circle")).not.toBeNull());
    fireEvent.click(desktop);
    await waitFor(() => expect(mobile.querySelector("circle")).toBeNull());
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("provides a named menu action and invokes its completion after saving the theme", () => {
    document.documentElement.classList.add("dark");
    render(provider(
      <>
        <ThemeToggle variant="menu" onToggle={() => {
          screen.getByRole("status").textContent = localStorage.getItem("theme");
        }} />
        <output role="status" />
      </>,
    ));
    const toggle = screen.getByRole("menuitem", { name: "Change theme" });
    expect(toggle.textContent).toBe("Change theme");
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("light");
  });
});
