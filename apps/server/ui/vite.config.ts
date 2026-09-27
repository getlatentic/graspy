import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ASSETS_DIR = "views/assets";
// Every browser that runs a service worker reads woff2; the older formats
// are fallbacks, which the sandbox's worker leaves to the network.
const FALLBACK_FONT = /\.(woff|ttf)$/;
const WORKER = new URL("./src/sandbox/ui-sandbox-sw.js", import.meta.url);

// The sandbox's service worker, with the digest of every view file of this
// build written into it: pages can write the worker's caches, never its script.
function sandboxWorker(): Plugin {
  return {
    name: "graspy-sandbox-worker",
    apply: "build",
    // Last, so each file is hashed as it is written.
    enforce: "post",
    generateBundle(_options, bundle) {
      const files = Object.fromEntries(
        Object.values(bundle)
          .filter(
            ({ fileName }) =>
              fileName.startsWith(`${ASSETS_DIR}/`) &&
              !FALLBACK_FONT.test(fileName),
          )
          .sort((a, b) => a.fileName.localeCompare(b.fileName))
          .map((file) => [
            `/${file.fileName}`,
            createHash("sha256")
              .update(file.type === "chunk" ? file.code : file.source)
              .digest("base64"),
          ]),
      );
      this.emitFile({
        type: "asset",
        fileName: "views/ui-sandbox-sw.js",
        source: readFileSync(WORKER, "utf-8").replace(
          "__FILES__",
          JSON.stringify(files),
        ),
      });
    },
  };
}

// Built into the server's static assets. The server reads each document for
// its ui:// resource; scripts, styles and fonts stay files, which browsers
// cache across visits.
export default defineConfig({
  plugins: [react(), tailwindcss(), sandboxWorker()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "../assets",
    emptyOutDir: true,
    assetsDir: ASSETS_DIR,
    rollupOptions: {
      input: ["views/practice.html", "views/passage.html", "views/lesson.html"],
    },
  },
});
