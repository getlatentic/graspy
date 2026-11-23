// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Created = {
  ontoolresult?: (params: unknown) => void;
  onhostcontextchanged?: (changed: object) => void;
  getHostContext: () => object;
};
const app: Created = {
  getHostContext: () => ({ theme: "dark", locale: "en" }),
};
vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
  useApp: ({ onAppCreated }: { onAppCreated: (created: Created) => void }) => {
    onAppCreated(app);
    return { app, error: null };
  },
}));

const { useToolResult } = await import("./use-tool-result");

afterEach(() => {
  cleanup();
  app.getHostContext = () => ({ theme: "dark", locale: "en" });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

const open = () => renderHook(() => useToolResult("test view", () => ({})));

describe("a view's theme", () => {
  it("is the one its host opened it with", () => {
    open();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("follows the host while the view is open", () => {
    open();

    act(() => app.onhostcontextchanged?.({ theme: "light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    act(() => app.onhostcontextchanged?.({ theme: "dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("is left as it was by a change that names none", () => {
    open();

    act(() => app.onhostcontextchanged?.({ locale: "yo" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it.each(["sepia", "", 3, null, { mode: "dark" }])(
    "is left as it was by a theme that is not light or dark: %j",
    (theme) => {
      open();

      act(() => app.onhostcontextchanged?.({ theme }));

      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
    },
  );

  it("is not set at all when the host sends one that is not light or dark", () => {
    app.getHostContext = () => ({ theme: "sepia" });
    open();

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe("");
  });
});
