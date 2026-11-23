import { describe, expect, it } from "vitest";
import { qrPath } from "./qr-path";

const LINK = "https://graspy-staging.getlatentic.com/link#code=ABCD2345";

/** The modules a path draws, as "column,row" after the quiet zone. */
function modulesOf(path: string, quiet: number): Set<string> {
  return new Set(
    [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(
      (match) => `${Number(match[1]) - quiet},${Number(match[2]) - quiet}`,
    ),
  );
}

describe("the QR code of a link", () => {
  it("is a square of whole modules, a standard size, with a quiet zone of four on each side", async () => {
    const { size } = await qrPath(LINK);

    const modules = size - 8;
    expect((modules - 17) % 4).toBe(0);
    expect(modules).toBeGreaterThanOrEqual(21);
    expect(modules).toBeLessThanOrEqual(45);
  });

  it("has the three finder squares that a scanner looks for", async () => {
    const { path, size } = await qrPath(LINK);
    const dark = modulesOf(path, 4);
    const last = size - 8 - 1;

    for (const [left, top] of [
      [0, 0],
      [last - 6, 0],
      [0, last - 6],
    ]) {
      // A 7 by 7 ring around a 3 by 3 block, with a light ring between.
      for (let offset = 0; offset < 7; offset += 1) {
        for (const edge of [0, 6]) {
          expect(dark.has(`${left + offset},${top + edge}`)).toBe(true);
          expect(dark.has(`${left + edge},${top + offset}`)).toBe(true);
        }
      }
      expect(dark.has(`${left + 3},${top + 3}`)).toBe(true);
      expect(dark.has(`${left + 1},${top + 1}`)).toBe(false);
    }
  });

  it("is the same for the same link and differs for another", async () => {
    const first = await qrPath(LINK);

    expect(await qrPath(LINK)).toEqual(first);
    expect((await qrPath(LINK.replace("ABCD2345", "WXYZ6789"))).path).not.toBe(
      first.path,
    );
  });

  it("holds a link far longer than a sign-in address", async () => {
    const { size } = await qrPath(`https://example.com/${"a".repeat(200)}`);

    expect(size).toBeGreaterThan(50);
  });
});
