// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Created = {
  ontoolresult?: (params: unknown) => void;
  onhostcontextchanged?: (changed: object) => void;
  getHostContext: () => object;
  sendMessage: ReturnType<typeof vi.fn>;
};
const app: Created = {
  getHostContext: () => ({ theme: "light", locale: "en" }),
  sendMessage: vi.fn(),
};
vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
  useApp: ({ onAppCreated }: { onAppCreated: (created: Created) => void }) => {
    onAppCreated(app);
    return { app, error: null };
  },
}));

const { ChoiceView } = await import("./choice-view");

const CARD = {
  content: [{ type: "text", text: "Which class are you in?" }],
  structuredContent: {
    question: "Which class are you in?",
    options: ["JSS 1", "JSS 2", "JSS 3"],
  },
  _meta: { viewUUID: "a".repeat(32) },
};

function open(result: unknown = CARD) {
  render(<ChoiceView />);
  act(() => app.ontoolresult?.(result));
}

const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

beforeEach(() => {
  localStorage.clear();
  app.sendMessage = vi.fn().mockResolvedValue({});
});
afterEach(cleanup);

describe("a choice card", () => {
  it("shows nothing for a result that is not a choice", () => {
    open({
      ...CARD,
      structuredContent: { question: "Which?", options: ["A"] },
    });

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the question, each answer and a way back to typing, all buttons", () => {
    open();

    expect(screen.getByText("Which class are you in?")).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["JSS 1", "JSS 2", "JSS 3", "Something else"]);
  });

  it("sends the tapped answer to the chat as the learner's message", async () => {
    open();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "JSS 2" }));
    });

    expect(app.sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: [{ type: "text", text: "JSS 2" }],
    });
    expect(pressed("JSS 2")).toBe("true");
  });

  it("is chosen again when it is opened again", async () => {
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "JSS 3" }));
    });
    cleanup();

    open();

    expect(pressed("JSS 3")).toBe("true");
  });

  it("lets the learner go back to typing, sending nothing", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "Something else" }));

    expect(screen.getByRole("status").textContent).toBe(
      "Type your answer below.",
    );
    expect(app.sendMessage).not.toHaveBeenCalled();
  });

  it("sends one message for a double tap, in the same frame or after", async () => {
    open();
    const jss1 = screen.getByRole("button", { name: "JSS 1" });
    const jss2 = screen.getByRole("button", { name: "JSS 2" });

    await act(async () => {
      fireEvent.click(jss1);
      fireEvent.click(jss1);
      fireEvent.click(jss2);
    });
    await act(async () => {
      fireEvent.click(jss2);
    });

    expect(app.sendMessage).toHaveBeenCalledOnce();
    expect(pressed("JSS 1")).toBe("true");
  });

  it("stays answered, showing the option chosen, and cannot be tapped again", async () => {
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "JSS 2" }));
    });
    cleanup();

    open();

    expect(pressed("JSS 2")).toBe("true");
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "JSS 3" }));
    expect(app.sendMessage).not.toHaveBeenCalledTimes(2);
  });

  it("is told to wait while graspy is still answering, and can be tapped again", async () => {
    app.sendMessage = vi.fn().mockResolvedValue({ isError: true });
    open();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "JSS 1" }));
    });

    expect(screen.getByRole("status").textContent).toContain("Not now");
    expect(pressed("JSS 1")).toBe("false");
  });
});
