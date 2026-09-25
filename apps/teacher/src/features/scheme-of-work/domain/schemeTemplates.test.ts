import { describe, expect, it } from "vitest";

import { chosenTemplate, weekKindName } from "./schemeTemplates";
import type { SchemeTemplateSummary } from "./schemeOfWork";

function template(id: string): SchemeTemplateSummary {
  return { id, title: id, weeks: [] } as unknown as SchemeTemplateSummary;
}

describe("chosenTemplate", () => {
  it("shows the first template before the teacher has chosen one", () => {
    expect(chosenTemplate([template("a"), template("b")], null)?.id).toBe("a");
  });

  it("shows the one they chose", () => {
    expect(chosenTemplate([template("a"), template("b")], "b")?.id).toBe("b");
  });

  it("falls back to the first when the chosen template is gone from the library", () => {
    expect(chosenTemplate([template("a"), template("b")], "removed")?.id).toBe("a");
  });

  it("shows nothing when the library is empty", () => {
    expect(chosenTemplate([], "a")).toBeNull();
  });
});

describe("weekKindName", () => {
  it("names each kind of week as a timetable would", () => {
    expect(weekKindName("revision")).toBe("Revision");
    expect(weekKindName("test")).toBe("Test");
    expect(weekKindName("examination")).toBe("Examinations");
    expect(weekKindName("break")).toBe("Break");
  });

  it("names an ordinary week for what happens in it", () => {
    expect(weekKindName("teaching")).toBe("Teaching");
  });
});
