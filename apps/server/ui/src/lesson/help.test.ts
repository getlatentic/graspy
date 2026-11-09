import { describe, expect, it } from "vitest";
import { afterHelp, NO_HELP, struckOf } from "./help";

describe("the help a check has been given", () => {
  it("takes out each wrong option as it is tried", () => {
    const first = afterHelp(NO_HELP, 1, { kind: "cue", keep: [] });

    expect(first.given).toBe("cue");
    expect([...struckOf(first, 4)]).toEqual([1]);
  });

  it("takes out what the question was narrowed past, and keeps it so", () => {
    const first = afterHelp(NO_HELP, 1, { kind: "cue", keep: [] });
    const second = afterHelp(first, 2, { kind: "narrow", keep: [0, 3] });

    expect(second.given).toBe("narrow");
    expect(second.tried).toEqual([1, 2]);
    expect([...struckOf(second, 5)].sort()).toEqual([1, 2, 4]);
  });

  it("offers every option before any help", () => {
    expect(struckOf(NO_HELP, 4).size).toBe(0);
  });
});
