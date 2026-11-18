import {
  Banknote,
  Clock,
  Hash,
  PieChart,
  Plus,
  Shapes,
  Type,
  X,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import { NEUTRAL_THEME_ICON, themeIcon } from "./theme-icons";

describe("themeIcon", () => {
  it.each([
    ["alphabet", Type],
    ["number", Hash],
    ["operations", Plus],
    ["multiplication", X],
    ["time", Clock],
    ["money", Banknote],
    ["shapes", Shapes],
    ["fractions", PieChart],
  ])("gives %s its own icon", (topic, icon) => {
    expect(themeIcon(topic)).toBe(icon);
  });

  it("gives every theme the app names an icon of its own", () => {
    const icons = Object.keys(en.voice.topics).map(themeIcon);
    expect(icons).not.toContain(NEUTRAL_THEME_ICON);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("gives a theme it does not know the neutral icon", () => {
    expect(themeIcon("astronomy")).toBe(NEUTRAL_THEME_ICON);
  });
});
