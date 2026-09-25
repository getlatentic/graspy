import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LaunchHealthGateway } from "../application/LaunchHealthGateway";
import type { LaunchFailure } from "../domain/launchHealth";
import { LaunchBoundary } from "./LaunchBoundary";

const libraryUnavailable: LaunchFailure = {
  code: "lesson-library-unavailable",
  detail: "database is locked (SQLITE_BUSY)",
};

const refusedContent: LaunchFailure = {
  code: "included-content-unavailable",
  detail: "A different curriculum file with this identifier and edition is already installed.",
};

function gatewayWith(overrides: Partial<LaunchHealthGateway> = {}): LaunchHealthGateway {
  return {
    check: vi.fn().mockResolvedValue(null),
    retry: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function renderBoundary(gateway: LaunchHealthGateway) {
  return render(
    <LaunchBoundary gateway={gateway}>
      <p>Your lessons</p>
    </LaunchBoundary>,
  );
}

describe("LaunchBoundary", () => {
  it("opens the workspace when graspy started cleanly", async () => {
    renderBoundary(gatewayWith());

    expect(await screen.findByText("Your lessons")).toBeVisible();
  });

  it("withholds the workspace when nothing is safe to open", async () => {
    renderBoundary(gatewayWith({ check: vi.fn().mockResolvedValue(libraryUnavailable) }));

    expect(
      await screen.findByRole("heading", { name: "graspy cannot open your saved lessons" }),
    ).toBeVisible();
    expect(screen.queryByText("Your lessons")).not.toBeInTheDocument();
  });

  it("never opens the workspace when the startup check itself fails", async () => {
    renderBoundary(
      gatewayWith({ check: vi.fn().mockRejectedValue(new Error("bridge unavailable")) }),
    );

    expect(
      await screen.findByRole("heading", { name: "graspy could not confirm it opened correctly" }),
    ).toBeVisible();
    expect(screen.queryByText("Your lessons")).not.toBeInTheDocument();
  });

  it("keeps a teacher working when only the included curriculum is missing", async () => {
    renderBoundary(gatewayWith({ check: vi.fn().mockResolvedValue(refusedContent) }));

    expect(await screen.findByText("Your lessons")).toBeVisible();
    expect(screen.getByText("The included curriculum could not be added")).toBeVisible();
  });

  it("opens the workspace once a retry resolves the failure", async () => {
    const retry = vi.fn().mockResolvedValue(null);
    const gateway = gatewayWith({
      check: vi.fn().mockResolvedValue(libraryUnavailable),
      retry,
    });
    const user = userEvent.setup();
    renderBoundary(gateway);

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
    expect(await screen.findByText("Your lessons")).toBeVisible();
  });

  it("keeps the teacher informed when a retry fails again", async () => {
    const gateway = gatewayWith({
      check: vi.fn().mockResolvedValue(libraryUnavailable),
      retry: vi.fn().mockResolvedValue(libraryUnavailable),
    });
    const user = userEvent.setup();
    renderBoundary(gateway);

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled(),
    );
    expect(screen.queryByText("Your lessons")).not.toBeInTheDocument();
  });

  it("does not offer a retry when only an update can help", async () => {
    renderBoundary(
      gatewayWith({
        check: vi.fn().mockResolvedValue({
          code: "needs-app-update",
          detail: "library version 25, this app supports up to 24",
        } satisfies LaunchFailure),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Update graspy to open your lessons" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("hands the teacher a copyable detail for their support contact", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderBoundary(gatewayWith({ check: vi.fn().mockResolvedValue(libraryUnavailable) }));

    await user.click(await screen.findByRole("button", { name: "Copy details" }));

    expect(writeText).toHaveBeenCalledWith(libraryUnavailable.detail);
    expect(await screen.findByRole("button", { name: "Details copied" })).toBeVisible();
  });
});
