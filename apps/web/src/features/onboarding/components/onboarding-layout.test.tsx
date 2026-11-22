// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeysApp } from "@/test/keys-app";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import pcm from "@/locales/pcm.json";
import yo from "@/locales/yo.json";
import OnboardingLayout from "./onboarding-layout";

afterEach(cleanup);

const layout = () =>
  render(
    <KeysApp>
      <OnboardingLayout header={<h1>title</h1>} footer={<button>go</button>}>
        <p>fields</p>
      </OnboardingLayout>
    </KeysApp>,
  );

describe("the onboarding page", () => {
  it("is two halves exactly the viewport tall from lg, with no page scroll", () => {
    const { container } = layout();
    const root = container.querySelector(".art-ground");
    for (const name of ["lg:h-dvh", "lg:overflow-hidden", "theme-light"]) {
      expect(root?.classList.contains(name), name).toBe(true);
    }
    const grid = root?.firstElementChild;
    for (const name of ["lg:grid-cols-2", "lg:h-dvh", "lg:grid-rows-1"]) {
      expect(grid?.classList.contains(name), name).toBe(true);
    }
  });

  it("puts the logo and the headline on the left, and the headline only where there is a left half", () => {
    const { container } = layout();
    const left = container.querySelector("aside");
    expect(left?.querySelector("a[href='/'] img[alt='graspy']")).toBeTruthy();
    const headline = screen.getByRole("heading", {
      level: 2,
      name: "onboarding.headline",
    });
    expect(left?.contains(headline)).toBe(true);
    expect(headline.parentElement?.classList.contains("hidden")).toBe(true);
    expect(headline.parentElement?.classList.contains("lg:flex")).toBe(true);
    expect(screen.getByText("onboarding.subline")).toBeTruthy();
  });

  it("keeps the title and the action still and scrolls only the fields, from lg", () => {
    const { container } = layout();
    const form = container.querySelector("main")?.firstElementChild;
    const [top, middle, bottom] = [...(form?.children ?? [])];
    expect(top?.querySelector("h1")).toBeTruthy();
    expect(top?.classList.contains("shrink-0")).toBe(true);
    expect(middle?.textContent).toBe("fields");
    for (const name of ["lg:overflow-y-auto", "lg:min-h-0", "lg:flex-1"]) {
      expect(middle?.classList.contains(name), name).toBe(true);
    }
    expect(bottom?.textContent).toBe("go");
  });

  it("has no picture and no card", () => {
    const { container } = layout();
    expect(
      [...container.querySelectorAll("img")].map((img) =>
        img.getAttribute("src"),
      ),
    ).toEqual(["/brand/sprout.svg", "/brand/wordmark.png"]);
    expect(container.querySelector(".rounded-sheet, .shadow-lift")).toBeNull();
  });

  it("scales the form with the screen", () => {
    const { container } = layout();
    expect(container.querySelector("main .zoom")).toBeTruthy();
    expect(container.querySelector("aside .zoom")).toBeTruthy();
  });
});

describe("the headline", () => {
  it("is written in all four locales", () => {
    for (const locale of [en, ar, pcm, yo]) {
      expect(locale.onboarding.headline).toBe(
        "Let's make learning awesome together.",
      );
      expect(locale.onboarding.subline).toBe(
        "A little about you to get started.",
      );
    }
  });
});
