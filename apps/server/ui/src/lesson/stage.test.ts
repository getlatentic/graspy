import { describe, expect, it } from "vitest";
import contract from "@/lib/card-contract.json";
import { lessonViewOf } from "@/lib/lesson";
import { lessonStage } from "./stage";

const { target } = contract.content["ui://graspy/lesson"];
const stageOf = (status: string, lesson: object | null) =>
  lessonStage(lessonViewOf({ status, target, lesson })!);
const slide = { title: "Kept", bodyMd: "Body" };

describe("lessonStage", () => {
  it("shows the lesson being made, then its objectives, then its slides", () => {
    expect(stageOf("making", null)).toBe("making");
    expect(
      stageOf("making", { title: "F", objectives: ["Add"], slides: [] }),
    ).toBe("objectives");
    expect(
      stageOf("making", { title: "F", objectives: ["Add"], slides: [slide] }),
    ).toBe("slides");
  });

  it("shows a lesson already made at once, and a failure without slides", () => {
    expect(stageOf("ready", { title: "F", slides: [slide] })).toBe("slides");
    expect(stageOf("failed", null)).toBe("failed");
  });
});
