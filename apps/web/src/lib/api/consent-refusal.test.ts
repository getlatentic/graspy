import { afterEach, describe, expect, it, vi } from "vitest";
import { onConsentRequired } from "./consent-refusal";
import { toApiError } from "./errors";

const answer = (status: number, code: string) =>
  new Response(JSON.stringify({ detail: { error: "no", code } }), { status });

const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));

function listening() {
  const heard = vi.fn();
  stops.push(onConsentRequired(heard));
  return heard;
}

describe("a refusal for want of a parent's agreement", () => {
  it("is announced to whoever listens, and is still an ApiError", async () => {
    const heard = listening();

    const error = await toApiError(answer(403, "consent_required"));

    expect(heard).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(403);
  });

  it.each([
    [403, "account_required"],
    [409, "consent_required"],
    [503, "consent_unavailable"],
  ])("is not announced for %i %s", async (status, code) => {
    const heard = listening();

    await toApiError(answer(status, code));

    expect(heard).not.toHaveBeenCalled();
  });

  it("is not announced to one who stopped listening", async () => {
    const heard = vi.fn();
    onConsentRequired(heard)();

    await toApiError(answer(403, "consent_required"));

    expect(heard).not.toHaveBeenCalled();
  });
});
