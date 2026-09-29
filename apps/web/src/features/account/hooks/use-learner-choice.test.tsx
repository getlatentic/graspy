// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serviceConsentKept } from "@/lib/account/service-consent";
import { setAccount } from "@/lib/account/account-store";
import { AGREED, listed, signedInAs, UID } from "@/test/account-session";

const { addLearner, chooseLearner } = vi.hoisted(() => ({
  addLearner: vi.fn(),
  chooseLearner: vi.fn(),
}));
vi.mock("@/lib/account/learners-api", () => ({ addLearner }));
vi.mock("@/lib/account/learner-choice", () => ({
  chooseLearner,
  UnsentChanges: class extends Error {},
}));

const { useLearnerChoice } = await import("./use-learner-choice");

const TOLU = listed("c00000000003", "Tolu", AGREED);
const PROOF = { noticeVersion: 1, firebaseIdToken: "fresh-token" };

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  signedInAs(null);
  addLearner.mockResolvedValue(TOLU);
  // Only a change of hash is a move in jsdom.
  chooseLearner
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValue("#opened");
});

describe("adding a learner and choosing them", () => {
  it("keeps the learner that was added when choosing them fails", async () => {
    const { result } = renderHook(() => useLearnerChoice());

    await act(() => result.current.addAndChoose("Tolu", PROOF));

    expect(result.current.added).toMatchObject({ id: TOLU.id });
    expect(result.current.problem).toBe("failed");
  });

  it("never adds a second learner, however often it is asked to add", async () => {
    const { result } = renderHook(() => useLearnerChoice());
    await act(() => result.current.addAndChoose("Tolu", PROOF));

    await act(() => result.current.addAndChoose("Tolu", PROOF));

    expect(addLearner).toHaveBeenCalledTimes(1);
    expect(chooseLearner).toHaveBeenCalledTimes(2);
    expect(chooseLearner.mock.calls[1][0]).toMatchObject({ id: TOLU.id });
  });

  it("adds a learner again once the one added has been let go of", async () => {
    const { result } = renderHook(() => useLearnerChoice());
    await act(() => result.current.addAndChoose("Tolu", PROOF));

    act(() => result.current.forgetAdded());
    await act(() => result.current.addAndChoose("Bo", PROOF));

    expect(addLearner).toHaveBeenCalledTimes(2);
    expect(addLearner.mock.calls[1][0]).toBe("Bo");
  });
});

describe("what the device remembers of a parent's agreement", () => {
  beforeEach(() => chooseLearner.mockResolvedValue("#opened"));

  it("is nothing for a learner the server lists without one", async () => {
    const { result } = renderHook(() => useLearnerChoice());

    await act(() =>
      result.current.choose(listed("g00000000004", "Grace", null)),
    );

    expect(serviceConsentKept(UID, "g00000000004")).toBe(false);
  });

  it("is nothing for a learner the device holds, whose agreement it was not told of", async () => {
    const { result } = renderHook(() => useLearnerChoice());

    await act(() =>
      result.current.choose({ id: "g00000000004", name: "Grace" }),
    );

    expect(serviceConsentKept(UID, "g00000000004")).toBe(false);
  });

  it("is kept for a learner the server lists with one", async () => {
    const { result } = renderHook(() => useLearnerChoice());

    await act(() => result.current.choose(TOLU));

    expect(serviceConsentKept(UID, TOLU.id)).toBe(true);
  });
});

afterEach(() => setAccount(null));
