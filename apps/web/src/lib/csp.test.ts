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

  it("allows the API's WebSocket, which a source of https:// does not", () => {
    const policy = headers.match(/Content-Security-Policy:.*/)?.[0] ?? "";
    const connectSrc = policy.match(/connect-src[^;]*/)?.[0] ?? "";

    expect(connectSrc).toContain("https://graspy-api.getlatentic.com");
    expect(connectSrc).toContain("wss://graspy-api.getlatentic.com");
  });

  it("lets Turnstile's script and frame load, and nothing else of Cloudflare's", () => {
    const policy = headers.match(/Content-Security-Policy:.*/)?.[0] ?? "";
    const directive = (name: string) =>
      policy.match(new RegExp(`${name}[^;]*`))?.[0] ?? "";

    expect(directive("script-src")).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(directive("frame-src")).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(directive("default-src")).not.toContain("challenges.cloudflare.com");
    expect(directive("connect-src")).not.toContain("challenges.cloudflare.com");
  });

  it("does not weaken script-src with 'unsafe-inline'", () => {
    const policy = headers.match(/Content-Security-Policy:.*/)?.[0] ?? "";
    const scriptSrc = policy.match(/script-src[^;]*/)?.[0] ?? "";

    expect(scriptSrc).not.toContain("unsafe-inline");
  });
});

// dist is ignored by git, so this runs where a build has been made and skips
// on a fresh checkout.
const built = import.meta.glob("../../dist/index.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("Content-Security-Policy on the built page", () => {
  it.skipIf(Object.keys(built).length === 0)(
    "allows the boot script Vite wrote to dist/index.html",
    async () => {
      const body = Object.values(built)[0]!.match(INLINE_SCRIPT)?.[1];
      expect(body, "dist/index.html has no inline script").toBeDefined();

      const digest = await sha256Base64(body!);

      expect(
        headers,
        `dist/index.html is stale or its inline script changed: run ` +
          `npm run build, and put 'sha256-${digest}' in public/_headers.`,
      ).toContain(`'sha256-${digest}'`);
    },
  );
});
