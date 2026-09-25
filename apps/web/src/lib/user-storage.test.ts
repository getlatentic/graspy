import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserProfile } from "./user-storage";
import { ON_MY_OWN } from "./learner-level";

const KEY = "graspy_user_profile";
let store: Map<string, string>;

function saved(profile: Record<string, unknown>) {
  store.set(KEY, JSON.stringify(profile));
}

beforeEach(() => {
  store = new Map();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  vi.stubGlobal("localStorage", localStorage);
});

describe("a profile saved before the catalogue", () => {
  it("keeps a university year as its level after school", () => {
    saved({ stage: "university", universityYear: "2", course: "Law" });

    expect(getUserProfile()).toMatchObject({
      level: "undergraduate",
      course: "Law",
    });
  });

  it("keeps a postgraduate as a graduate", () => {
    saved({ stage: "university", universityYear: "postgraduate" });

    expect(getUserProfile()?.level).toBe("graduate");
  });

  it("keeps a learner on their own as one", () => {
    saved({ stage: "self", goal: "Chess" });

    expect(getUserProfile()?.level).toBe(ON_MY_OWN);
  });

  it("keeps a school class's year, shown as the server named it until placed", () => {
    saved({ stage: "secondary", schoolGrade: "grade_7", gradeLevel: "JSS 1" });

    expect(getUserProfile()).toMatchObject({
      level: "",
      levelNames: null,
      gradeLevel: "JSS 1",
      earlierYear: 7,
    });
    const rewritten = JSON.parse(store.get(KEY) ?? "{}");
    expect(rewritten).not.toHaveProperty("schoolGrade");
    expect(rewritten).toMatchObject({ level: "", earlierYear: 7 });
  });
});
