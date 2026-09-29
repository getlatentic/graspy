import { describe, expect, it } from "vitest";
import API_DOC from "../../../../../docs/API.md?raw";
import {
  recordingsNotice,
  RETENTION_DAYS,
  SERVICE_NOTICE,
} from "./consent-notices";

// The notices are the API's contract: what the parent is shown is what they agree to.

/** The quoted text under the line that introduces a notice. */
function noticeAfter(heading: string): string {
  const after = API_DOC.slice(API_DOC.indexOf(heading) + heading.length);
  const quoted = after.match(/^\s*> (.+)$/m);
  if (!quoted) throw new Error(`No notice after "${heading}"`);
  return quoted[1];
}

describe("the notices a parent is shown", () => {
  it("say what the API documents for the service, word for word", () => {
    expect(SERVICE_NOTICE).toBe(noticeAfter("Notice 1 of scope `service`:"));
  });

  it.each(RETENTION_DAYS)(
    "say what the API documents for keeping recordings for %i days",
    (days) => {
      const documented = noticeAfter(
        "Notice 1 of scope `recordings`, with the days the parent picks in place of the brackets:",
      ).replace("[30 / 90 / 365]", String(days));

      expect(recordingsNotice(days)).toBe(documented);
    },
  );
});
