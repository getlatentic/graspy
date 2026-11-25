// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { routes } from "@/routes";

async function landingOf(path: string): Promise<string> {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await waitFor(() =>
    expect(router.state.location.pathname).not.toBe(path),
  );
  return router.state.location.pathname;
}

describe("/try", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("opens the same place as /app", async () => {
    const app = await landingOf("/app");
    cleanup();
    expect(await landingOf("/try")).toBe(app);
  });
});
