// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import type { CurrentTopic } from "@/features/learn/lib/current-topic";
import { ResumeCard } from "./resume-card";

const { band } = vi.hoisted(() => ({
  band: { now: "child" as "child" | "tween" | "teen" },
}));
vi.mock("@/lib/use-age-band", () => ({ useAgeBand: () => band.now }));

afterEach(cleanup);

const current = {
  subject: { name: "Mathematics", slug: "mathematics" },
  topic: "Sets",
  topics: ["Sets", "Functions"],
  topicIndex: 0,
  started: false,
} as unknown as CurrentTopic;

const t = (key: string) =>
  key.split(".").reduce<unknown>((v, part) => (v as never)?.[part], en) ?? key;

function pictureFor(now: "child" | "tween" | "teen") {
  band.now = now;
  const { container } = render(
    <I18nContext.Provider value={{ t } as never}>
      <ResumeCard
        current={current}
        grade="SS 3"
        completed={0}
        onOpenTopic={() => {}}
      />
    </I18nContext.Provider>,
  );
  const img = container.querySelector("img")!;
  return { img, box: img.parentElement! };
}

describe("ResumeCard picture", () => {
  it.each(["child", "tween", "teen"] as const)("uses the %s picture", (now) => {
    expect(pictureFor(now).img.getAttribute("src")).toBe(
      `/brand/art/math-${now}.webp`,
    );
  });

  it("loads at once and ahead of other images: it is the largest paint on Learn home", () => {
    const { img } = pictureFor("child");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("is a small hairline-framed mark for a teen and a large bold-framed one for a child", () => {
    const child = pictureFor("child").box.className;
    cleanup();
    const teen = pictureFor("teen").box.className;

    expect(child).toContain("lg:size-32");
    expect(child).toContain("border-4");
    expect(teen).toContain("lg:size-20");
    expect(teen).not.toContain("border-2");
  });
});
