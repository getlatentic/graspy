import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Merged rather than configured standalone so the `@` alias and plugins have a
// single definition; vite.config.ts stays a build file only.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
      coverage: {
        // Every source file, not only the ones a test imports. Without this
        // the percentage describes the tested files and flatters the total.
        all: true,
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/test/**",
          "src/**/*.d.ts",
          "src/locales/**",
        ],
      },
    },
  }),
);
