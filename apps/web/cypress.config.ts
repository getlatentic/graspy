import path from "node:path";
import { defineConfig } from "cypress";

// A child saying "fifty six", between silences: Chrome plays it, looped, as the microphone.
const SPOKEN_ANSWER = path.resolve("cypress/fixtures/fifty-six.wav");

export default defineConfig({
  e2e: {
    // Vite's dev server.
    baseUrl: "http://localhost:5173",
    // A card's view runs in a frame on the server's origin, inside the
    // sandbox proxy's; the chat specs read and tap it there.
    chromeWebSecurity: false,
    setupNodeEvents(on) {
      on("before:browser:launch", (browser, options) => {
        if (browser.family === "chromium" && browser.name !== "electron") {
          options.args.push(
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-audio-capture=${SPOKEN_ANSWER}`,
            // The sandboxed audio service cannot read the file on macOS: it gives silence.
            "--disable-features=AudioServiceOutOfProcess",
          );
        }
        return options;
      });
      on("task", {
        log(message) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
