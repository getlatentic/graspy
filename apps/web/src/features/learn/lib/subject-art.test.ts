import { describe, expect, it } from "vitest";
import { subjectArt } from "./subject-art";

describe("subjectArt", () => {
  it.each([
    ["Mathematics", "math"],
    ["Integrated Science", "science"],
    ["English Language", "english"],
    ["ICT", "ict"],
    ["Computer Science", "ict"],
    ["Agricultural Science", "agriculture"],
    ["Business Studies", "business"],
    ["History", "history"],
    ["Social Studies", "geography"],
    ["Music", "music"],
    ["Creative Arts", "art"],
    ["English Language Arts", "english"],
    ["Physical Education", "pe"],
    ["Civic Education", "civic"],
    ["Agricultural Technology", "agriculture"],
    ["Political Science", "civic"],
    ["Martial Arts", "pe"],
    ["Basic Science and Technology", "science"],
    ["Information Technology", "ict"],
  ])("gives %s the %s picture", (name, art) => {
    expect(subjectArt(name)).toBe(art);
  });

  it("does not take a keyword from inside another word", () => {
    expect(subjectArt("Dictation")).toBeNull();
    expect(subjectArt("Microprocessor Systems")).toBeNull();
    expect(subjectArt("Aircraft Maintenance")).toBeNull();
    expect(subjectArt("Transport Studies")).toBeNull();
    expect(subjectArt("Home Economics")).toBeNull();
    expect(subjectArt("Yoruba Language")).toBeNull();
  });

  it("gives a subject with no picture none", () => {
    expect(subjectArt("Religious Studies")).toBeNull();
  });
});
