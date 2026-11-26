// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-db";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import { ChatMessageItem } from "./chat-message";

const user = (content: string): ChatMessage => ({
  id: "m1",
  threadId: "t",
  type: "user",
  content,
  timestamp: 1,
  sender: "user",
});

function shown(message: ChatMessage) {
  const chat = en.chat as unknown as Record<string, string>;
  render(
    <MemoryRouter>
      <I18nContext.Provider
        value={
          {
            t: (key: string, values: Record<string, string | number> = {}) =>
              Object.entries(values).reduce(
                (text, [name, value]) =>
                  text.replace(`{${name}}`, String(value)),
                chat[key.split(".")[1]] ?? key,
              ),
          } as unknown as React.ContextType<typeof I18nContext>
        }
      >
        <ChatMessageItem message={message} />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("the learner's messages", () => {
  it("show the answer to a path card as the courses and the count, not every topic", () => {
    shown(
      user(
        "Add to my plan:\nCourse: Real analysis\n- Limits | SS 3\n- Series | SS 4",
      ),
    );

    expect(screen.getByText("Add to my plan: Real analysis (2)")).toBeTruthy();
    expect(screen.queryByText(/Limits/)).toBeNull();
  });

  it("show anything else as it was written", () => {
    shown(user("Add to my plan: real analysis"));

    expect(screen.getByText("Add to my plan: real analysis")).toBeTruthy();
  });
});
