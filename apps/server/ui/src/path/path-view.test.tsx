// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contract from "@/lib/card-contract.json";

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

const { PathView } = await import("./path-view");

const PATH = contract.content["ui://graspy/path"];
const TWO_COURSES = {
  paths: [
    {
      subject: "Real analysis",
      goal: "Real analysis",
      steps: [
        { title: "Limits", level: "SS 3" },
        { title: "Sequences", level: "Undergraduate" },
        { title: "Series", level: "Undergraduate" },
      ],
    },
    {
      subject: "Quantum computing",
      goal: "Quantum computing",
      steps: [{ title: "Qubits", level: "Undergraduate" }],
    },
  ],
};

const card = (content: object = PATH) => ({
  content: [{ type: "text", text: "A learning path" }],
  structuredContent: content,
  _meta: { viewUUID: "c".repeat(32) },
});

function open(result: unknown = card()) {
  render(<PathView />);
  act(() => app.ontoolresult?.(result));
}

const row = (title: string) =>
  screen.getByRole("checkbox", { name: new RegExp(title) }) as HTMLInputElement;
const add = () =>
  screen.getByRole("button", { name: /Add to my plan/ }) as HTMLButtonElement;
/** A press, with the microtasks of the host's answer settled before it returns. */
const press = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });
const sent = () => app.sendMessage.mock.calls[0][0].content[0].text as string;

beforeEach(() => {
  localStorage.clear();
  app.sendMessage = vi.fn().mockResolvedValue({});
});
afterEach(cleanup);

describe("the path card", () => {
  it("shows nothing for a result that is not a path", () => {
    open(card({ paths: [] }));

    expect(screen.queryByRole("form")).toBeNull();
  });

  it("lists each course with every topic on, and says how many will be added", () => {
    open(card(TWO_COURSES));

    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(
      screen
        .getAllByRole("checkbox")
        .every((box) => (box as HTMLInputElement).checked),
    ).toBe(true);
    expect(add().textContent).toBe("Add to my plan (4)");
    expect(screen.getByText("Real analysis")).toBeTruthy();
    expect(screen.getByText("Quantum computing")).toBeTruthy();
  });

  it("sends only the topics left on, each course with its levels, when the learner adds", async () => {
    open(card(TWO_COURSES));

    fireEvent.click(row("Sequences"));
    expect(add().textContent).toBe("Add to my plan (3)");
    await press(add());

    expect(app.sendMessage).toHaveBeenCalledOnce();
    expect(sent()).toBe(
      [
        "Add to my plan:",
        "Course: Real analysis",
        "- Limits | SS 3",
        "- Series | Undergraduate",
        "Course: Quantum computing",
        "- Qubits | Undergraduate",
      ].join("\n"),
    );
  });

  it("leaves a course out of the answer when none of its topics is kept", async () => {
    open(card(TWO_COURSES));

    fireEvent.click(row("Qubits"));
    await press(add());

    expect(app.sendMessage).toHaveBeenCalledOnce();
    expect(sent()).not.toContain("Quantum computing");
  });

  it("cannot add with no topic chosen", () => {
    open(card(TWO_COURSES));

    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);

    expect(add().disabled).toBe(true);
    fireEvent.click(add());
    expect(app.sendMessage).not.toHaveBeenCalled();
  });

  it("sends the answer once, and then shows what was chosen and cannot be changed", async () => {
    open(card(TWO_COURSES));
    fireEvent.click(row("Series"));

    await act(async () => {
      fireEvent.click(add());
      fireEvent.click(add());
    });

    expect(add().disabled).toBe(true);
    expect(app.sendMessage).toHaveBeenCalledOnce();
    expect(row("Series").disabled).toBe(true);
    expect(row("Series").checked).toBe(false);
    expect(row("Limits").checked).toBe(true);
    fireEvent.click(row("Limits"));
    expect(row("Limits").checked).toBe(true);
  });

  it("stays as it was, with a word, when the host does not take the message", async () => {
    app.sendMessage = vi.fn().mockResolvedValue({ isError: true });
    open(card(TWO_COURSES));

    await press(add());

    expect(screen.getByRole("status")).toBeTruthy();
    expect(add().disabled).toBe(false);
    expect(row("Limits").disabled).toBe(false);
  });

  it("asks what is missing in a field, and sends it as the learner's message", async () => {
    open(card(TWO_COURSES));

    fireEvent.click(screen.getByRole("button", { name: "Something missing?" }));
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(
      (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(field, { target: { value: "  Black holes  " } });
    await press(screen.getByRole("button", { name: "Send" }));

    expect(app.sendMessage).toHaveBeenCalledOnce();
    expect(sent()).toBe("Please change the path: Black holes");
    expect(field.disabled).toBe(true);
    expect(add().disabled).toBe(true);
  });

  it("limits what can be said to a sentence or two", () => {
    open(card(TWO_COURSES));

    fireEvent.click(screen.getByRole("button", { name: "Something missing?" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "x".repeat(900) },
    });

    expect(
      (screen.getByRole("textbox") as HTMLTextAreaElement).value,
    ).toHaveLength(300);
  });

  it("shows an answered card as answered when it is opened again", () => {
    localStorage.setItem(
      `graspy.path.${"c".repeat(32)}`,
      JSON.stringify({ off: ["0:1"], sent: true }),
    );

    open(card(TWO_COURSES));

    expect(add().disabled).toBe(true);
    expect(row("Sequences").checked).toBe(false);
    expect(row("Limits").checked).toBe(true);
  });
});
