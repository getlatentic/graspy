// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { goBack } from "@/lib/back-stack";
import { KeysApp } from "@/test/keys-app";
import { VoiceNote } from "./voice-note";

afterEach(cleanup);

describe("the voice note", () => {
  it("is something Back closes, as OK, and takes itself off the stack when it goes", () => {
    const ok = vi.fn();
    const { unmount } = render(
      <KeysApp>
        <VoiceNote onOk={ok} />
      </KeysApp>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(goBack({ back: vi.fn(), state: { idx: 2 } })).toBe("closed");
    expect(ok).toHaveBeenCalledOnce();
    unmount();
    expect(goBack({ back: vi.fn(), state: { idx: 0 } })).toBe("stayed");
  });
});
