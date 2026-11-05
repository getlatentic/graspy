// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import { RECONNECTING } from "@/features/learn/lib/chat-view-state";
import { TutorActivity } from "./tutor-activity";

function messageOf(key: string): string {
  return key
    .split(".")
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown>)[part],
      en,
    ) as string;
}

function shown(tool: string | null) {
  render(
    <I18nContext.Provider
      value={
        {
          t: (key: string) => messageOf(key),
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      <TutorActivity tool={tool} />
    </I18nContext.Provider>,
  );
  return screen.getByRole("status").textContent;
}

afterEach(cleanup);

describe("TutorActivity", () => {
  it("says it is reconnecting while the connection to the turn is down", () => {
    expect(shown(RECONNECTING)).toBe(en.chat.reconnecting);
  });

  it("names the tool the tutor is using", () => {
    expect(shown("calculate")).toBe(en.chat.activity.calculate);
  });

  it("says the tutor is thinking when it is using none", () => {
    expect(shown(null)).toBe(en.chat.tutorThinking);
  });
});
