// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { SECTIONS } from "@/features/learn/lib/app-sections";
import { CHAT_WIDTH } from "@/features/learn/lib/pane-layout";
import en from "@/locales/en.json";
import { ChatPane, HideChatButton } from "./chat-pane";
import { SideNav } from "./side-nav";

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function inApp(node: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/app/learn/subjects"]}>
      <I18nContext.Provider
        value={{ t, locale: "en", setLocale: () => {} } as never}
      >
        {node}
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

const capture = vi.fn();
beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = capture;
});
afterEach(() => {
  cleanup();
  capture.mockClear();
  vi.restoreAllMocks();
  document.body.style.removeProperty("user-select");
});

const down = (divider: Element, clientX: number, pointerId = 1) =>
  fireEvent.pointerDown(divider, {
    button: 0,
    clientX,
    pointerId,
    isPrimary: true,
  });

describe("ChatPane", () => {
  const pane = (props: Partial<Parameters<typeof ChatPane>[0]> = {}) => {
    const onOpen = vi.fn();
    const onResize = vi.fn();
    inApp(
      <ChatPane open width={400} onOpen={onOpen} onResize={onResize} {...props}>
        <p>the conversation</p>
      </ChatPane>,
    );
    return { onOpen, onResize };
  };

  it("shows the conversation beside the lesson at the width it was given", () => {
    pane();
    expect(screen.getByText("the conversation")).toBeTruthy();
    expect(screen.getByRole("complementary").style.width).toBe("400px");
    const divider = screen.getByRole("separator");
    expect(divider.getAttribute("aria-valuenow")).toBe("400");
    expect(divider.getAttribute("aria-valuemin")).toBe(String(CHAT_WIDTH.min));
    expect(divider.getAttribute("aria-valuemax")).toBe(String(CHAT_WIDTH.max));
  });

  it("is resized from the keyboard", () => {
    const { onResize } = pane();
    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
    expect(onResize).toHaveBeenCalledWith(432);
    fireEvent.keyDown(screen.getByRole("separator"), { key: "Tab" });
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it("leaves the browser's own shortcuts on the arrow keys alone", () => {
    const { onResize } = pane();
    for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
      fireEvent.keyDown(screen.getByRole("separator"), {
        key: "ArrowLeft",
        [modifier]: true,
      });
    }
    expect(onResize).not.toHaveBeenCalled();
  });

  it("starts from the width it is drawn at when the screen leaves it less than was chosen", () => {
    const { onResize } = pane({ width: 640 });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(512);
    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
    expect(onResize).toHaveBeenCalledWith(480);
  });

  it("follows the pointer while dragging and keeps the width when it lets go", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    down(divider, 600);
    expect(capture).toHaveBeenCalledWith(1);
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerMove(divider, { clientX: 540, pointerId: 1 });
    expect(screen.getByRole("complementary").style.width).toBe("460px");
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(460);
    expect(document.body.style.userSelect).toBe("");
  });

  it("drags the other way when the page reads right to left", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    const style = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({ ...style(element), direction: "rtl" }) as CSSStyleDeclaration,
    );
    down(divider, 100);
    fireEvent.pointerMove(divider, { clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(460);
  });

  it("does not go past its widest or its narrowest", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    down(divider, 600);
    fireEvent.pointerMove(divider, { clientX: -4000, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(CHAT_WIDTH.max);
    down(divider, 0);
    fireEvent.pointerMove(divider, { clientX: 4000, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(CHAT_WIDTH.min);
  });

  it("keeps its width when the pointer is cancelled, and when it was only clicked", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    down(divider, 600);
    fireEvent.pointerMove(divider, { clientX: 500, pointerId: 1 });
    fireEvent.pointerCancel(divider, { pointerId: 1 });
    expect(screen.getByRole("complementary").style.width).toBe("400px");
    down(divider, 600);
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
    expect(document.body.style.userSelect).toBe("");
  });

  it("follows one pointer only", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    down(divider, 600, 1);
    fireEvent.pointerDown(divider, {
      button: 0,
      clientX: 100,
      pointerId: 2,
      isPrimary: false,
    });
    fireEvent.pointerMove(divider, { clientX: 0, pointerId: 2 });
    expect(screen.getByRole("complementary").style.width).toBe("400px");
    fireEvent.pointerUp(divider, { pointerId: 2 });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerMove(divider, { clientX: 560, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(440);
  });

  it("ignores a pointer that was never pressed on the divider", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    fireEvent.pointerMove(divider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("folds to a button that opens it, with no divider", () => {
    const { onOpen } = pane({ open: false });
    expect(screen.queryByRole("separator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.chat.openTutor }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("keeps the conversation mounted while folded, hidden from sight and from the keyboard", () => {
    pane({ open: false });
    const hidden = screen.getByText("the conversation").parentElement!;
    expect(hidden.hidden).toBe(true);
    expect(hidden.hasAttribute("inert")).toBe(true);
  });

  it("keeps what is in the conversation across a fold", () => {
    function Draft({ open }: { open: boolean }) {
      return (
        <ChatPane open={open} width={400} onOpen={() => {}} onResize={() => {}}>
          <input aria-label="draft" />
        </ChatPane>
      );
    }
    const view = inApp(<Draft open />);
    fireEvent.change(screen.getByLabelText("draft"), {
      target: { value: "half a question" },
    });
    const again = (open: boolean) => (
      <MemoryRouter>
        <I18nContext.Provider
          value={{ t, locale: "en", setLocale: () => {} } as never}
        >
          <Draft open={open} />
        </I18nContext.Provider>
      </MemoryRouter>
    );
    view.rerender(again(false));
    view.rerender(again(true));
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe(
      "half a question",
    );
  });

  it("moves focus to the button that undoes the one pressed", () => {
    function Panes() {
      const [open, setOpen] = useState(true);
      return (
        <ChatPane
          open={open}
          width={400}
          onOpen={() => setOpen(true)}
          onResize={() => {}}
        >
          <HideChatButton onHide={() => setOpen(false)} />
        </ChatPane>
      );
    }
    inApp(<Panes />);
    fireEvent.click(screen.getByRole("button", { name: en.chat.hide }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      en.chat.openTutor,
    );
    fireEvent.click(screen.getByRole("button", { name: en.chat.openTutor }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      en.chat.hide,
    );
  });

  it("is hidden from the button in its header", () => {
    const onHide = vi.fn();
    inApp(<HideChatButton onHide={onHide} />);
    fireEvent.click(screen.getByRole("button", { name: en.chat.hide }));
    expect(onHide).toHaveBeenCalledOnce();
  });
});

describe("SideNav", () => {
  it("names each section and marks the one the learner is in", () => {
    inApp(<SideNav sections={SECTIONS} open onToggle={() => {}} />);
    expect(screen.getAllByRole("link")).toHaveLength(SECTIONS.length);
    const current = screen.getByRole("link", { current: "page" });
    expect(current.textContent).toBe(en.nav.subjects);
  });

  it("keeps each section's name for a screen reader when it is folded", () => {
    inApp(<SideNav sections={SECTIONS} open={false} onToggle={() => {}} />);
    const home = screen.getByRole("link", { name: en.nav.home });
    expect(home.querySelector(".sr-only")?.textContent).toBe(en.nav.home);
  });

  it("folds and unfolds from its button", () => {
    const onToggle = vi.fn();
    const { rerender } = inApp(
      <SideNav sections={SECTIONS} open onToggle={onToggle} />,
    );
    const fold = screen.getByRole("button", { name: en.nav.collapse });
    fireEvent.click(fold);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <MemoryRouter>
        <I18nContext.Provider
          value={{ t, locale: "en", setLocale: () => {} } as never}
        >
          <SideNav sections={SECTIONS} open={false} onToggle={onToggle} />
        </I18nContext.Provider>
      </MemoryRouter>,
    );
    const unfold = screen.getByRole("button", { name: en.nav.expand });
    expect(unfold.hasAttribute("aria-expanded")).toBe(false);
  });
});
