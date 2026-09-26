import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ASSETS_DIR = "views/assets";
// Every browser that runs a service worker reads woff2; the older formats
// are fallbacks, cached only when a browser asks for one.
const FALLBACK_FONT = /\.(woff|ttf)$/;

// The hashed files of every view, for the sandbox's service worker to cache
// once any view has opened, so that all of them open offline.
function precacheList(): Plugin {
  return {
    name: "graspy-precache-list",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter(
          (name) =>
            name.startsWith(`${ASSETS_DIR}/`) && !FALLBACK_FONT.test(name),
        )
        .sort()
        .map((name) => `/${name}`);
      this.emitFile({
        type: "asset",
        fileName: "views/precache.json",
        source: JSON.stringify(files),
      });
    },
  };
}

// Built into the server's static assets. The server reads each document for
// its ui:// resource; scripts, styles and fonts stay files, which browsers
// cache across visits.
export default defineConfig({
  plugins: [react(), tailwindcss(), precacheList()],
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
