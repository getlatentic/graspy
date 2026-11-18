import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";

describe("page", () => {
  it("opens the API's connection while the scripts download", () => {
    expect(html).toMatch(
      /<link rel="preconnect" href="%VITE_API_URL%" crossorigin \/>/,
    );
  });
});
