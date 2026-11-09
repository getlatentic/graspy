// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = vi.fn();
});
afterEach(cleanup);

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

  it("follows the pointer while dragging and keeps the width when it lets go", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    fireEvent.pointerDown(divider, { button: 0, clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 540, pointerId: 1 });
    expect(screen.getByRole("complementary").style.width).toBe("460px");
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(460);
  });

  it("does not go past its widest or its narrowest", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    fireEvent.pointerDown(divider, { button: 0, clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: -4000, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(CHAT_WIDTH.max);
    fireEvent.pointerDown(divider, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 4000, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(CHAT_WIDTH.min);
  });

  it("ignores a pointer that was never pressed on the divider", () => {
    const { onResize } = pane();
    const divider = screen.getByRole("separator");
    fireEvent.pointerMove(divider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("folds to a button that opens it, with no conversation or divider", () => {
    const { onOpen } = pane({ open: false });
    expect(screen.queryByText("the conversation")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.chat.openTutor }));
    expect(onOpen).toHaveBeenCalledOnce();
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
    expect(fold.getAttribute("aria-expanded")).toBe("true");
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
    expect(
      screen
        .getByRole("button", { name: en.nav.expand })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
