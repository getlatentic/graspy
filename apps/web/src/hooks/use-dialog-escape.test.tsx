// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installRemoteInput } from "@/lib/remote-input";
import { useDialog } from "./use-dialog";

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  cleanup();
});

function Sheet({ onClose }: { onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      <button>ok</button>
    </div>
  );
}

describe("Escape on a dialog", () => {
  it("closes it once: the key has one owner", () => {
    stop = installRemoteInput(document);
    const close = vi.fn();
    render(<Sheet onClose={close} />);
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(close).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });
});
