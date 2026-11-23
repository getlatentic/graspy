import { useMediaQuery } from "./use-media-query";

/** The page's colour scheme: the device's, since the app follows `prefers-color-scheme` alone. */
export function useColorScheme(): "light" | "dark" {
  return useMediaQuery("(prefers-color-scheme: dark)") ? "dark" : "light";
}
