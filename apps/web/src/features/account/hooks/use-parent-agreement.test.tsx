// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const session = vi.hoisted(() => ({
  age: vi.fn<() => number | null>(),
  drop: vi.fn(),
}));
vi.mock("@/lib/api/session", async (original) => ({
  ...(await original<typeof import("@/lib/api/session")>()),
  parentSessionAge: session.age,
  dropParentSession: session.drop,
}));

const { useParentAgreement } = await import("./use-parent-agreement");

beforeEach(() => {
  session.age.mockReset();
  session.drop.mockReset();
});

describe("tapping I agree", () => {
  it("keeps a parent's session of a minute ago, which is young enough", () => {
    session.age.mockReturnValue(60_000);
    const { result } = renderHook(() =>
      useParentAgreement(async () => undefined),
    );

    act(() => result.current.agree());

    expect(session.drop).not.toHaveBeenCalled();
    expect(result.current.asking).toBe(true);
  });

  it("lets go of a parent's session of three minutes ago, so the PIN is asked for again", () => {
    session.age.mockReturnValue(3 * 60_000);
    const { result } = renderHook(() =>
      useParentAgreement(async () => undefined),
    );

    act(() => result.current.agree());

    expect(session.drop).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(true);
  });

  it("has nothing to let go of when there is no parent's session", () => {
    session.age.mockReturnValue(null);
    const { result } = renderHook(() =>
      useParentAgreement(async () => undefined),
    );

    act(() => result.current.agree());

    expect(session.drop).not.toHaveBeenCalled();
  });
});

describe("an agreement the server found stale", () => {
  it("lets go of the session and stays at the gate for the PIN", async () => {
    session.age.mockReturnValue(10_000);
    const refused = new ApiError("refused", 403, {
      detail: { code: "parent_fresh_required" },
    });
    const { result } = renderHook(() =>
      useParentAgreement(async () => {
        throw refused;
      }),
    );
    act(() => result.current.agree());

    await act(async () => result.current.proceed());

    expect(session.drop).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(true);
    expect(result.current.problem).toBeNull();
  });
});
