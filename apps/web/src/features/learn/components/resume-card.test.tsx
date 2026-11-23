// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import type { CurrentTopic } from "@/features/learn/lib/current-topic";
import { ResumeCard } from "./resume-card";

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

function pictureFor(band: "child" | "tween" | "teen") {
  const { container } = render(
    <I18nContext.Provider value={{ t } as never}>
      <ResumeCard
        current={current}
        grade="SS 3"
        band={band}
        completed={0}
        onOpenTopic={() => {}}
      />
    </I18nContext.Provider>,
  );
  const img = container.querySelector("img")!;
  return { img, box: img.parentElement! };
}

describe("ResumeCard picture", () => {
  it.each(["child", "tween", "teen"] as const)(
    "uses the %s picture",
    (band) => {
      expect(pictureFor(band).img.getAttribute("src")).toBe(
        `/brand/art/math-${band}.webp`,
      );
    },
  );

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
