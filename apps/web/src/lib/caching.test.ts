import { describe, expect, it } from "vitest";
import headers from "../../public/_headers?raw";

/** The headers a path rule sets, as Pages reads them: a rule is a path line, then indented lines. */
function rule(path: string): string[] {
  const lines = headers.split("\n");
  const start = lines.indexOf(path);
  if (start < 0) return [];
  const found: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    found.push(line.trim());
  }
  return found;
}

describe("caching", () => {
  it("keeps the build's hashed files for a year, unchanged", () => {
    expect(rule("/assets/*")).toContain(
      "Cache-Control: public, max-age=31536000, immutable",
    );
  });

  it("keeps the versioned cue sounds for a year, unchanged", () => {
    expect(rule("/sounds/*")).toContain(
      "Cache-Control: public, max-age=31536000, immutable",
    );
  });

  it("leaves the page and the service worker to be checked every time", () => {
    expect(rule("/*").join(" ")).not.toMatch(/Cache-Control/);
    expect(rule("/sw.js")).toContain("Cache-Control: no-cache");
  });
});
