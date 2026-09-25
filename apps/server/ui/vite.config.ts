import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Built into the server's static assets. The server reads each document for
// its ui:// resource; scripts, styles and fonts stay files, which browsers
// cache across visits.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "../assets",
    emptyOutDir: true,
    assetsDir: "views/assets",
    rollupOptions: {
      input: ["views/practice.html", "views/passage.html", "views/lesson.html"],
    },
  },
});
