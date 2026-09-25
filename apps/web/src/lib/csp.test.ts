import { describe, expect, it } from "vitest";
// ?raw and Web Crypto keep this inside the browser tsconfig, with no node types.
import html from "../../index.html?raw";
import headers from "../../public/_headers?raw";

// A stale hash in public/_headers fails only in production, as a blank page.
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/;

async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe("Content-Security-Policy", () => {
  it("allows the boot script by hash, not by 'unsafe-inline'", async () => {
    const body = html.match(INLINE_SCRIPT)?.[1];
    expect(body, "index.html has no inline script").toBeDefined();

    const digest = await sha256Base64(body!);

    expect(
      headers,
      `The inline script in index.html changed. Update its hash in ` +
        `public/_headers to 'sha256-${digest}'.`,
    ).toContain(`'sha256-${digest}'`);
  });

  it("does not weaken script-src with 'unsafe-inline'", () => {
    const policy = headers.match(/Content-Security-Policy:.*/)?.[0] ?? "";
    const scriptSrc = policy.match(/script-src[^;]*/)?.[0] ?? "";

    expect(scriptSrc).not.toContain("unsafe-inline");
  });
});
