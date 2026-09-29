import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { consentProblemOf } from "./consent-problem";

const refusal = (status: number, code: string) =>
  new ApiError("refused", status, { detail: { error: "refused", code } });

describe("what a parent is told when agreeing did not go through", () => {
  it.each([
    [401, "sign_in_stale", "signIn"],
    [401, "sign_in_invalid", "signIn"],
    [503, "sign_in_unchecked", "signIn"],
    [403, "sign_in_other_account", "otherAccount"],
    [400, "notice_unknown", "notice"],
    [503, "consent_unavailable", "failed"],
    [404, "no_such_learner", "failed"],
  ])("%i %s is %s", (status, code, problem) => {
    expect(consentProblemOf(refusal(status, code))).toBe(problem);
  });

  it("names signing in with another Google account than the one signed in", () => {
    expect(consentProblemOf({ code: "auth/user-mismatch" })).toBe(
      "otherAccount",
    );
  });

  it("names a window the browser blocked", () => {
    expect(consentProblemOf({ code: "auth/popup-blocked" })).toBe(
      "popupBlocked",
    );
  });

  it("is nothing for a window the parent closed", () => {
    expect(consentProblemOf({ code: "auth/popup-closed-by-user" })).toBeNull();
    expect(
      consentProblemOf({ code: "auth/cancelled-popup-request" }),
    ).toBeNull();
  });

  it("is a failure for anything else", () => {
    expect(consentProblemOf(new Error("offline"))).toBe("failed");
  });
});
