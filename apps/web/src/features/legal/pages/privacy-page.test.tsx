// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { router } from "@/routes";
import { SiteFooter } from "@/features/landing/components/site-chrome";
import { PRIVACY_SECTIONS } from "../privacy-content";
import PrivacyPage from "./privacy-page";

afterEach(cleanup);

function page(ui = <PrivacyPage />) {
  render(<MemoryRouter initialEntries={["/privacy"]}>{ui}</MemoryRouter>);
}

describe("the privacy policy", () => {
  it("has a title, its date, and every section", () => {
    page();

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy policy" }),
    ).toBeTruthy();
    expect(screen.getByText(/^Updated \d/)).toBeTruthy();
    expect(document.title).toBe("Privacy policy — graspy");
    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(PRIVACY_SECTIONS.map((section) => section.title));
  });

  it("gives a way to ask about privacy", () => {
    page();

    const mail = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("mailto:"));
    expect(mail.length).toBeGreaterThan(0);
  });

  it("is a route of the site", () => {
    const paths = router.routes[0]?.children?.map((route) => route.path);

    expect(paths).toContain("/privacy");
  });

  it("is linked from the site footer", () => {
    page(<SiteFooter />);

    const link = screen.getByRole("link", { name: "Privacy" });
    expect(link.getAttribute("href")).toBe("/privacy");
  });
});
