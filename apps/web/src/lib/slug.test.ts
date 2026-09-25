import { describe, expect, it } from "vitest";
import fc from "fast-check";
import corpus from "../../../../tests/fixtures/slug-corpus.json";
import { createSlug, normalizeSlug, normalizeSubjectList } from "./slug";

// The server's tests/test_slug_parity.py asserts the same table.
describe("normalizeSlug matches the shared corpus", () => {
  it.each(corpus)("$input -> $expected", ({ input, expected }) => {
    expect(normalizeSlug(input)).toBe(expected);
  });
});

describe("normalizeSlug", () => {
  it("keeps a Hausa hooked consonant rather than colliding Baƙi with Bai", () => {
    expect(normalizeSlug("Baƙi")).not.toBe(normalizeSlug("Bai"));
  });

  it("always returns a trimmed, lowercase, non-empty slug", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const slug = normalizeSlug(value);
        expect(slug.length).toBeGreaterThan(0);
        expect(slug).toBe(slug.toLowerCase());
        expect(slug).not.toMatch(/^-|-$|--/);
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const once = normalizeSlug(value);
        expect(normalizeSlug(once)).toBe(once);
      }),
    );
  });
});

describe("createSlug", () => {
  it("suffixes rather than colliding, and reserves what it returns", () => {
    const existing = new Set<string>();

    expect(createSlug("Mathematics", existing)).toBe("mathematics");
    expect(createSlug("Mathematics", existing)).toBe("mathematics-2");
    expect(createSlug("Mathematics", existing)).toBe("mathematics-3");
  });

  it("never returns a slug already in the set", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("Maths", "Physics", "maths", "MATHS"), {
          maxLength: 10,
        }),
        (names) => {
          const existing = new Set<string>();
          const issued = names.map((n) => createSlug(n, existing));
          expect(new Set(issued).size).toBe(issued.length);
        },
      ),
    );
  });
});

describe("normalizeSubjectList", () => {
  it("drops blank names and maps each name to its slug", () => {
    const { subjects, nameToSlug } = normalizeSubjectList([
      "Mathematics",
      "   ",
      { name: "Chemistry" },
    ]);

    expect(subjects).toEqual([
      { name: "Mathematics", slug: "mathematics" },
      { name: "Chemistry", slug: "chemistry" },
    ]);
    expect(nameToSlug.get("Chemistry")).toBe("chemistry");
  });
});
