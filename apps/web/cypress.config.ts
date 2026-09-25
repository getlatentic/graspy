import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    // Vite's dev server.
    baseUrl: "http://localhost:5173",
    // A card's view runs in a frame on the server's origin, inside the
    // sandbox proxy's; the chat specs read and tap it there.
    chromeWebSecurity: false,
    setupNodeEvents(on) {
      on("task", {
        log(message) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
