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

const { DetailsView } = await import("./details-view");

const FORM = {
  country: "SK",
  askCountry: true,
  countries: ["NG", "SK", "GB"],
  classLists: [
    ["JSS 1", "JSS 2", "Undergraduate", "Graduate"],
    ["Grade 1", "Grade 7", "Secondary Year 4", "Undergraduate", "Graduate"],
  ],
  classListOf: { NG: 0, SK: 1, GB: 1 },
  afterSchool: ["Undergraduate", "Graduate"],
};

const card = (form: object = FORM) => ({
  content: [
    {
      type: "text",
      text: "A form asking the learner their country and class.",
    },
  ],
  structuredContent: form,
  _meta: { viewUUID: "b".repeat(32) },
});

function open(result: unknown = card()) {
  render(<DetailsView />);
  act(() => app.ontoolresult?.(result));
}

const country = () => screen.getByRole("combobox") as HTMLSelectElement;
const buttonNames = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((name) => name !== "Continue");
const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");
const choose = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const cont = () =>
  screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  app.sendMessage = vi.fn().mockResolvedValue({});
});
afterEach(cleanup);

describe("the About you form", () => {
  it("shows nothing for a result that is not a form", () => {
    open(card({ ...FORM, countries: [] }));

    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("starts on the country it was given, named in words, with every country to choose", () => {
    open();

    expect(country().value).toBe("SK");
    expect(country().selectedOptions[0].textContent).toBe("Slovakia");
    expect(Array.from(country().options).map((o) => o.textContent)).toEqual([
      "Nigeria",
      "Slovakia",
      "United Kingdom",
    ]);
  });

  it("shows the classes of that country, then Undergraduate and Graduate", () => {
    open();

    expect(buttonNames()).toEqual([
      "Grade 1",
      "Grade 7",
      "Secondary Year 4",
      "Undergraduate",
      "Graduate",
    ]);
  });

  it("lists the classes again when the country changes, with no call to the server", () => {
    open();

    fireEvent.change(country(), { target: { value: "NG" } });

    expect(buttonNames()).toEqual([
      "JSS 1",
      "JSS 2",
      "Undergraduate",
      "Graduate",
    ]);
    expect(app.sendMessage).not.toHaveBeenCalled();
  });

  it("keeps a class both countries have and drops one the new country lacks", () => {
    open();
    choose("Undergraduate");
    fireEvent.change(country(), { target: { value: "NG" } });
    expect(pressed("Undergraduate")).toBe("true");

    choose("JSS 2");
    fireEvent.change(country(), { target: { value: "SK" } });

    expect(
      screen
        .queryAllByRole("button", { pressed: true })
        .map((button) => button.textContent),
    ).toEqual([]);
  });

  it("cannot continue until a class is chosen", () => {
    open();

    expect(cont().disabled).toBe(true);
    choose("Grade 7");
    expect(cont().disabled).toBe(false);
  });

  it("starts on no country when none was suggested, and cannot continue until one is chosen", () => {
    open(card({ ...FORM, country: null }));

    expect(country().value).toBe("");
    expect(screen.getByText("Choose your country")).toBeTruthy();
    expect(buttonNames()).toEqual([]);
    expect(cont().disabled).toBe(true);

    fireEvent.change(country(), { target: { value: "SK" } });
    choose("Grade 7");
    expect(cont().disabled).toBe(false);
  });

  it("sends the answers as the learner's message when Continue is pressed", async () => {
    open();
    choose("Grade 7");

    await act(async () => {
      fireEvent.click(cont());
    });

    expect(app.sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: [
        { type: "text", text: "Country: Slovakia (SK). Class: Grade 7." },
      ],
    });
  });

  it("sends the country the learner changed it to, named in English", async () => {
    open();
    fireEvent.change(country(), { target: { value: "NG" } });
    choose("JSS 2");

    await act(async () => {
      fireEvent.click(cont());
    });

    expect(app.sendMessage.mock.calls[0][0].content[0].text).toBe(
      "Country: Nigeria (NG). Class: JSS 2.",
    );
  });

  it("asks for a course only after Undergraduate or Graduate, and sends it", async () => {
    open();
    expect(screen.queryByLabelText("What do you study?")).toBeNull();

    choose("Undergraduate");
    expect(cont().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("What do you study?"), {
      target: { value: "  Civil engineering " },
    });
    expect(cont().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(cont());
    });

    expect(app.sendMessage.mock.calls[0][0].content[0].text).toBe(
      "Country: Slovakia (SK). Class: Undergraduate. Course: Civil engineering.",
    );

    cleanup();
    open();
    expect(screen.getByLabelText("What do you study?")).toBeTruthy();
  });

  it("takes the course away again when a school class is chosen instead", () => {
    open();
    choose("Undergraduate");
    expect(screen.getByLabelText("What do you study?")).toBeTruthy();

    choose("Grade 7");

    expect(screen.queryByLabelText("What do you study?")).toBeNull();
  });

  it("can be sent from the keyboard: the form submits on Enter in the course field", async () => {
    open();
    choose("Graduate");
    const course = screen.getByLabelText("What do you study?");
    fireEvent.change(course, { target: { value: "Law" } });

    await act(async () => {
      fireEvent.submit(course.closest("form")!);
    });

    expect(app.sendMessage).toHaveBeenCalledOnce();
  });

  it("is made of controls the keyboard reaches: a select, buttons and an input", () => {
    open();
    choose("Graduate");

    const form = screen.getByRole("form");
    const controls = Array.from(form.querySelectorAll("select, button, input"));
    expect(controls.length).toBeGreaterThan(5);
    for (const control of controls) {
      expect(control.getAttribute("tabindex")).toBeNull();
    }
    expect(screen.getByLabelText("Country")).toBe(country());
  });

  it("sends one message for a double press", async () => {
    open();
    choose("Grade 7");

    await act(async () => {
      fireEvent.click(cont());
      fireEvent.click(cont());
    });

    expect(app.sendMessage).toHaveBeenCalledOnce();
  });

  it("stays answered, showing what was chosen, and cannot be changed", async () => {
    open();
    choose("Grade 7");
    await act(async () => {
      fireEvent.click(cont());
    });
    cleanup();

    open();

    expect(country().value).toBe("SK");
    expect(country().disabled).toBe(true);
    expect(pressed("Grade 7")).toBe("true");
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("is told to wait while graspy is still answering, and can be pressed again", async () => {
    app.sendMessage = vi.fn().mockResolvedValue({ isError: true });
    open();
    choose("Grade 7");

    await act(async () => {
      fireEvent.click(cont());
    });

    expect(screen.getByRole("status").textContent).toContain("Not now");
    expect(cont().disabled).toBe(false);
    expect(country().disabled).toBe(false);
  });

  it("does not ask the country again when the learner has said it", () => {
    open(
      card({ ...FORM, askCountry: false, countries: ["SK"], country: "SK" }),
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(buttonNames()).toContain("Grade 7");
  });

  it("names the countries in the host's language", () => {
    open();
    act(() => app.onhostcontextchanged?.({ locale: "sk" }));

    expect(country().selectedOptions[0].textContent).toBe("Slovensko");
  });
});
