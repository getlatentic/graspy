// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { router } from "@/routes";
import { SiteFooter } from "@/features/landing/components/site-chrome";
import { LEARNERS_PAGE } from "@/features/learn/lib/app-sections";
import DeleteAccountPage, { DELETE_REQUEST } from "./delete-account-page";
import PrivacyPage from "./privacy-page";

afterEach(cleanup);

function page(ui = <DeleteAccountPage />) {
  render(
    <MemoryRouter initialEntries={["/delete-account"]}>{ui}</MemoryRouter>,
  );
}

describe("the page for deleting an account", () => {
  it("says how to, signed in or not", () => {
    page();

    expect(document.title).toBe("Delete your account — graspy");
    expect(
      screen.getByRole("heading", { level: 1, name: "Delete your account" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Learners" }).getAttribute("href"),
    ).toBe(LEARNERS_PAGE);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(DELETE_REQUEST);
    expect(DELETE_REQUEST).toMatch(/^mailto:.+\?subject=.*Delete/);
  });

  it("is a route of the site, needing no sign-in", () => {
    const paths = router.routes[0]?.children?.map((route) => route.path);

    expect(paths).toContain("/delete-account");
  });

  it("is linked from the site footer", () => {
    page(<SiteFooter />);

    expect(
      screen.getByRole("link", { name: "Delete account" }).getAttribute("href"),
    ).toBe("/delete-account");
  });

  it("is what the privacy policy points to for someone who cannot sign in", () => {
    page(<PrivacyPage />);

    const links = screen
      .getAllByRole("link", { name: "Delete your account" })
      .map((link) => link.getAttribute("href"));
    expect(links).toContain("/delete-account");
    expect(document.body.textContent).not.toMatch(/does not delete graspy/);
  });
});
