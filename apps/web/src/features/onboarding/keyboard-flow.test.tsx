// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDialog } from "@/hooks/use-dialog";
import { installRemoteInput } from "@/lib/remote-input";
import { KeysApp } from "@/test/keys-app";
import OnboardingLayout from "./components/onboarding-layout";
import SearchableSelect from "./components/searchable-select";
import SubjectsStep from "./components/steps/subjects-step";
import type { useSubjectChoices } from "./hooks/use-subject-choices";

let stopRemote = () => {};

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  stopRemote = installRemoteInput();
});

afterEach(() => {
  stopRemote();
  delete document.documentElement.dataset.device;
  cleanup();
});

/** A remote's Back key, which has no `key` name, only a code. */
const back = (target: Element | Document, keyCode: number) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  target.dispatchEvent(event);
};

const OPTIONS = ["Grade 1", "Grade 2", "Grade 3"].map((label) => ({
  value: label,
  label,
  group: "Primary",
}));

function Picker() {
  const [value, setValue] = useState("");
  return (
    <KeysApp>
      <SearchableSelect
        id="grade"
        label="Class"
        value={value}
        onChange={setValue}
        options={OPTIONS}
        placeholder="Choose your class"
      />
    </KeysApp>
  );
}

describe("the class picker with a keyboard or a remote", () => {
  it("opens with the down arrow, moves with the arrows, picks with OK", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const field = screen.getByRole("combobox") as HTMLInputElement;
    field.focus();
    await user.keyboard("{ArrowDown}");
    expect(field.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(field.value).toBe("Grade 3");
    expect(field.getAttribute("aria-expanded")).toBe("false");
  });

  it("moves in the list with Home, End, PageUp and PageDown while it is a button (a TV), and leaves Home and End to the text cursor once Search is pressed", async () => {
    document.documentElement.dataset.device = "tv";
    const user = userEvent.setup();
    render(<Picker />);
    const field = screen.getByRole("combobox") as HTMLInputElement;
    field.focus();
    await user.keyboard("{ArrowDown}");
    const handled = (key: string) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const key of ["Home", "End", "PageUp", "PageDown"]) {
      expect(handled(key), key).toBe(true);
    }
    await user.click(screen.getByRole("button", { name: /search/i }));
    for (const key of ["Home", "End"]) {
      expect(handled(key), key).toBe(false);
    }
  });

  it("closes on Back (webOS 461 and Tizen 10009) before anything else, and keeps focus on the field", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const field = screen.getByRole("combobox");
    field.focus();
    for (const code of [461, 10009]) {
      await user.keyboard("{ArrowDown}");
      expect(field.getAttribute("aria-expanded")).toBe("true");
      back(field, code);
      await Promise.resolve();
      expect(field.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(field);
    }
  });
});

const subjects = {
  available: ["Maths", "English", "Art", "Music"].map((label) => ({
    id: label,
    label,
    recommended: false,
  })),
  loading: false,
  error: null,
  refetch: () => undefined,
} as unknown as ReturnType<typeof useSubjectChoices>;

function Subjects() {
  const form = useForm({ defaultValues: { selectedSubjects: [] as string[] } });
  return (
    <KeysApp>
      <FormProvider
        {...(form as unknown as Parameters<typeof FormProvider>[0])}
      >
        <SubjectsStep subjects={subjects} />
      </FormProvider>
    </KeysApp>
  );
}

describe("the subject list with a keyboard or a remote", () => {
  it("moves with the arrows, goes to the ends with Home and End, and toggles with OK and Space", async () => {
    const user = userEvent.setup();
    render(<Subjects />);
    const [maths, english, , music] = screen.getAllByRole("button");
    await user.tab();
    expect(document.activeElement).toBe(maths);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(english);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(music);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(maths);
    await user.keyboard("{Enter}");
    expect(maths.getAttribute("aria-pressed")).toBe("true");
    await user.keyboard("{ArrowDown} ");
    expect(english.getAttribute("aria-pressed")).toBe("true");
    await user.keyboard("{Enter}");
    expect(english.getAttribute("aria-pressed")).toBe("false");
  });

  it("is reached with Tab in page order and never with a positive tabindex", () => {
    const { container } = render(<Subjects />);
    expect(
      container.querySelector(
        "[tabindex]:not([tabindex='-1']):not([tabindex='0'])",
      ),
    ).toBeNull();
  });
});

function Sheet() {
  const [open, setOpen] = useState(false);
  return (
    <KeysApp>
      <button onClick={() => setOpen(true)}>open</button>
      {open ? <Dialog onClose={() => setOpen(false)} /> : null}
    </KeysApp>
  );
}
function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="sheet">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

describe("a dialog with a keyboard or a remote", () => {
  it("takes focus in, keeps Tab inside, closes on Escape and on Back, and gives focus back", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    const opener = screen.getByText("open");
    for (const close of [
      () => fireEvent.keyDown(document, { key: "Escape" }),
      () => back(document, 461),
      () => back(document, 10009),
    ]) {
      opener.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByText("first"));
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(screen.getByText("first"));
      close();
      await Promise.resolve();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
  });
});

describe("the onboarding page with a keyboard", () => {
  it("starts with the skip link, then the logo, and the skip link leads to the form", async () => {
    const user = userEvent.setup();
    render(
      <KeysApp>
        <OnboardingLayout header={<h1 id="page-title">title</h1>}>
          <input aria-label="field" />
        </OnboardingLayout>
      </KeysApp>,
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "onboarding.skip" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "onboarding.home" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("field"));
  });
});
