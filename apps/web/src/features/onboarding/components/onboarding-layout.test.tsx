// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeysApp } from "@/test/keys-app";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import pcm from "@/locales/pcm.json";
import yo from "@/locales/yo.json";
import OnboardingLayout from "./onboarding-layout";

afterEach(cleanup);

const layout = (resetKey = "a") =>
  render(
    <KeysApp>
      <OnboardingLayout
        resetKey={resetKey}
        header={<h1 id="page-title">title</h1>}
        footer={<button>go</button>}
      >
        <p>fields</p>
      </OnboardingLayout>
    </KeysApp>,
  );

describe("the onboarding page", () => {
  it("has a skip link to the form, which is the page's one main", () => {
    const { container } = layout();
    const skip = screen.getByRole("link", { name: "onboarding.skip" });
    expect(skip.getAttribute("href")).toBe("#main");
    expect(container.querySelector("main#main")).toBeTruthy();
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("holds the logo, which leads home, and the headline in the left half, and the headline is not a heading", () => {
    const { container } = layout();
    const left = container.querySelector("aside");
    const home = left?.querySelector("a[href='/']");
    expect(home?.getAttribute("aria-label")).toBe("onboarding.home");
    expect(home?.querySelector("img")).toBeTruthy();
    const headline = screen.getByText("onboarding.headline");
    expect(left?.contains(headline)).toBe(true);
    expect(headline.tagName).toBe("P");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.getByText("onboarding.subline")).toBeTruthy();
  });

  it("puts the title, the fields and the action in the right half in that order", () => {
    const { container } = layout();
    const form = container.querySelector("main")?.firstElementChild;
    const [top, middle, bottom] = [...(form?.children ?? [])];
    expect(top?.querySelector("h1")?.textContent).toBe("title");
    expect(middle?.textContent).toBe("fields");
    expect(bottom?.textContent).toBe("go");
  });

  it("has no picture beside the logo and no card", () => {
    const { container } = layout();
    expect(
      [...container.querySelectorAll("img")].map((img) =>
        img.getAttribute("src"),
      ),
    ).toEqual(["/brand/graspy-lockup-v1.svg"]);
    expect(container.querySelector(".rounded-sheet, .shadow-lift")).toBeNull();
  });

  it("uses logical padding only, so the halves flip for a right-to-left language", () => {
    const { container } = layout();
    const physical = [...container.querySelectorAll("[class]")].flatMap(
      (element) =>
        [...element.classList].filter((name) =>
          /(^|:)(p[lr]|m[lr]|left|right)-/.test(name),
        ),
    );
    // left-1/2 is the bar's centring, which is symmetric.
    expect(physical.filter((name) => !name.includes("left-1/2"))).toEqual([]);
  });

  it("answers to its own width (a container), not a zoom scope or the device", () => {
    const { container } = layout();
    expect(container.firstElementChild?.classList.contains("@container")).toBe(
      true,
    );
    expect(container.querySelector(".zoom")).toBeNull();
  });

  it("keeps the fields' scrollbar out of sight and the action outside what scrolls", () => {
    layout();
    const fields = screen.getByText("fields").parentElement;
    expect(fields?.classList.contains("quiet-scroll")).toBe(true);
    expect(fields?.contains(screen.getByText("go"))).toBe(false);
  });

  it("brings the fields back to the top when the step changes", () => {
    function Steps() {
      const [step, setStep] = useState("one");
      return (
        <KeysApp>
          <button onClick={() => setStep("two")}>next</button>
          <OnboardingLayout resetKey={step}>
            <p>{step}</p>
          </OnboardingLayout>
        </KeysApp>
      );
    }
    const { container } = render(<Steps />);
    const box = container.querySelector("main p")?.parentElement as HTMLElement;
    box.scrollTop = 120;
    expect(box.scrollTop).toBe(120);
    screen.getByText("next").click();
    return Promise.resolve().then(() => {
      expect(box.scrollTop).toBe(0);
    });
  });

  it("has no gap above the fields when there is no title", () => {
    const { container } = render(
      <KeysApp>
        <OnboardingLayout>
          <p>fields</p>
        </OnboardingLayout>
      </KeysApp>,
    );
    expect(
      container.querySelector("main p")?.parentElement?.className,
    ).not.toContain("mt-8");
  });
});

describe("the headline", () => {
  // The product is English only for now: the other locales carry the English strings as
  // placeholders by design, until their translations are written.
  it("is in all four locales", () => {
    for (const locale of [en, ar, pcm, yo]) {
      expect(locale.onboarding.headline.length).toBeGreaterThan(0);
      expect(locale.onboarding.subline.length).toBeGreaterThan(0);
      expect(locale.onboarding.skip.length).toBeGreaterThan(0);
    }
  });
});

describe("a new step in the single column", () => {
  const withScreen = (matches: boolean) => {
    const scrolled = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches }));
    vi.stubGlobal("scrollTo", scrolled);
    return scrolled;
  };
  afterEach(() => vi.unstubAllGlobals());

  it("scrolls the page back to its top, and leaves the page alone in the split layout", () => {
    const single = withScreen(false);
    const { rerender } = layout("one");
    single.mockClear();
    rerender(
      <KeysApp>
        <OnboardingLayout resetKey="two">
          <p>fields</p>
        </OnboardingLayout>
      </KeysApp>,
    );
    expect(single).toHaveBeenCalledWith(0, 0);
    cleanup();
    vi.unstubAllGlobals();
    const split = withScreen(true);
    layout("three");
    expect(split).not.toHaveBeenCalled();
  });
});
