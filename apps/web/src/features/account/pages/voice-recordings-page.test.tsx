// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { recordingsNotice } from "@/lib/account/consent-notices";
import type {
  Recording,
  VoiceOverview,
} from "@/lib/account/voice-recordings-api";
import { KeysApp } from "@/test/keys-app";
import {
  AGREED,
  listed,
  refused,
  signedInAs,
  WINDOW_CLOSED,
} from "@/test/account-session";
import { whenOf } from "../lib/recording-format";

const api = vi.hoisted(() => ({
  getVoice: vi.fn(),
  keepRecordings: vi.fn(),
  stopKeepingRecordings: vi.fn(),
  deleteRecording: vi.fn(),
  deleteRecordings: vi.fn(),
  recordingAudio: vi.fn(),
}));
const { listLearners, signInAgain } = vi.hoisted(() => ({
  listLearners: vi.fn(),
  signInAgain: vi.fn(),
}));
vi.mock("@/lib/account/voice-recordings-api", async (original) => ({
  ...(await original<typeof import("@/lib/account/voice-recordings-api")>()),
  ...api,
}));
vi.mock("@/lib/account/learners-api", () => ({ listLearners }));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
}));

const { default: VoiceRecordingsPage } =
  await import("./voice-recordings-page");

const ADA = "a00000000001";
const FIRST_AT = 1_780_000_000_000;

function recording(id: string, at: number, extra: Partial<Recording> = {}) {
  return {
    id,
    recordedAt: at,
    expiresAt: at + 30 * 86_400_000,
    lesson: null,
    transcript: null,
    durationSeconds: null,
    bytes: 1000,
    ...extra,
  };
}

const KEPT = [
  recording("s1", FIRST_AT, { lesson: "Counting to ten", durationSeconds: 7 }),
  recording("s2", FIRST_AT - 86_400_000),
];

const OFF: VoiceOverview = { consent: null, recordings: [], nextBefore: null };

function keeping(days: number, recordings: Recording[] = []): VoiceOverview {
  return {
    consent: { noticeVersion: 1, retentionDays: days, grantedAt: 5 },
    recordings,
    nextBefore: null,
  };
}

function open(voice: VoiceOverview) {
  api.getVoice.mockResolvedValue(voice);
  render(
    <KeysApp at={`/learners/${ADA}/voice`} path="/learners/:learnerId/voice">
      <VoiceRecordingsPage />
    </KeysApp>,
  );
}

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const keepSwitch = () =>
  screen.findByRole("switch", { name: "voiceRecordings.keep" });
const rowOf = (text: string) => screen.getByText(text).closest("li")!;

let urls = 0;

beforeEach(() => {
  vi.resetAllMocks();
  signedInAs(null);
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:audio-${++urls}`);
  URL.revokeObjectURL = vi.fn();
  listLearners.mockResolvedValue([listed(ADA, "Ada", AGREED)]);
  signInAgain.mockResolvedValue("fresh-token");
  api.stopKeepingRecordings.mockResolvedValue({ deleted: 0, more: false });
  api.deleteRecording.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  setAccount(null);
});

describe("the voice recordings page, when recordings are not kept", () => {
  it("says graspy deletes each recording once it has marked the answer, with the switch off", async () => {
    open(OFF);

    const toggle = await keepSwitch();

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("voiceRecordings.off")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "voiceRecordings.title",
    );
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(screen.queryByText("voiceRecordings.empty")).toBeNull();
    expect(api.getVoice).toHaveBeenCalledWith(ADA);
  });

  it("still lists what was kept before, which stays until it expires", async () => {
    open({ ...OFF, recordings: KEPT });

    expect(await screen.findByText(whenOf(FIRST_AT, "en"))).toBeTruthy();
    expect((await keepSwitch()).getAttribute("aria-checked")).toBe("false");
  });
});

describe("the voice recordings page, when recordings are kept", () => {
  it("lists each recording with its date, lesson and length", async () => {
    open(keeping(90, KEPT));

    await screen.findByText(whenOf(FIRST_AT, "en"));
    const first = rowOf(whenOf(FIRST_AT, "en"));

    expect(within(first).getByText("Counting to ten · 0:07")).toBeTruthy();
    expect(rowOf(whenOf(FIRST_AT - 86_400_000, "en"))).toBeTruthy();
    expect((await keepSwitch()).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("voiceRecordings.keptFor 90")).toBeTruthy();
  });

  it("says so when there are none yet", async () => {
    open(keeping(30));

    expect(await screen.findByText("voiceRecordings.empty")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("offers to try again when the page did not load, and shows the recordings once it does", async () => {
    api.getVoice.mockRejectedValueOnce(new Error("offline"));
    open(keeping(30, KEPT));

    fireEvent.click(
      await screen.findByRole("button", { name: "learners.tryAgain" }),
    );

    expect(await screen.findByText(whenOf(FIRST_AT, "en"))).toBeTruthy();
  });

  it("deletes one recording, and only that one", async () => {
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.delete",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText(whenOf(FIRST_AT, "en"))).toBeNull(),
    );
    expect(api.deleteRecording).toHaveBeenCalledWith(ADA, "s1");
    expect(screen.getByText(whenOf(FIRST_AT - 86_400_000, "en"))).toBeTruthy();
  });

  it("keeps the recording and says so when deleting it fails", async () => {
    api.deleteRecording.mockRejectedValueOnce(new Error("offline"));
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.delete",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "learners.failed",
    );
    expect(screen.getByText(whenOf(FIRST_AT, "en"))).toBeTruthy();
  });

  it("deletes them all, asking again for as long as the server says there is more", async () => {
    api.deleteRecordings
      .mockResolvedValueOnce({ deleted: 100, more: true })
      .mockResolvedValueOnce({ deleted: 100, more: true })
      .mockResolvedValueOnce({ deleted: 3, more: false });
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    tap("voiceRecordings.deleteAll");
    expect(api.deleteRecordings).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "voiceRecordings.deleteAll",
      }),
    );

    expect(await screen.findByText("voiceRecordings.empty")).toBeTruthy();
    expect(api.deleteRecordings).toHaveBeenCalledTimes(3);
    expect(api.deleteRecordings).toHaveBeenCalledWith(ADA);
  });

  it("keeps the recordings when deleting them all fails part way", async () => {
    api.deleteRecordings
      .mockResolvedValueOnce({ deleted: 100, more: true })
      .mockRejectedValueOnce(new Error("offline"));
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    tap("voiceRecordings.deleteAll");
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "voiceRecordings.deleteAll",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "learners.failed",
    );
    expect(screen.getByText(whenOf(FIRST_AT, "en"))).toBeTruthy();
  });

  it("shows more recordings when there are more to show", async () => {
    open({ ...keeping(30, [KEPT[0]]), nextBefore: FIRST_AT });
    api.getVoice.mockResolvedValue(keeping(30, [KEPT[1]]));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    tap("voiceRecordings.more");

    expect(
      await screen.findByText(whenOf(FIRST_AT - 86_400_000, "en")),
    ).toBeTruthy();
    expect(api.getVoice).toHaveBeenLastCalledWith(ADA, FIRST_AT);
    expect(screen.getByText(whenOf(FIRST_AT, "en"))).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "voiceRecordings.more" }),
    ).toBeNull();
  });
});

describe("turning recordings on", () => {
  async function asked() {
    open(OFF);
    fireEvent.click(await keepSwitch());
    await screen.findByText(recordingsNotice(30));
  }

  it("shows the notice for 30 days, and asks nothing of Google or the server yet", async () => {
    await asked();

    expect(
      (screen.getByLabelText("voiceRecordings.days 30") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(signInAgain).not.toHaveBeenCalled();
    expect(api.keepRecordings).not.toHaveBeenCalled();
  });

  it("changes the notice with the days chosen", async () => {
    await asked();

    fireEvent.click(screen.getByLabelText("voiceRecordings.days 365"));

    expect(screen.getByText(recordingsNotice(365))).toBeTruthy();
    expect(screen.queryByText(recordingsNotice(30))).toBeNull();
  });

  it("keeps them once the parent has signed in again and agreed, for the days chosen", async () => {
    api.keepRecordings.mockResolvedValue({
      noticeVersion: 1,
      retentionDays: 90,
      grantedAt: 9,
    });
    await asked();
    fireEvent.click(screen.getByLabelText("voiceRecordings.days 90"));

    tap("consent.agree");

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "true",
      ),
    );
    expect(api.keepRecordings).toHaveBeenCalledWith(ADA, 1, 90, "fresh-token");
    expect(signInAgain.mock.invocationCallOrder[0]).toBeLessThan(
      api.keepRecordings.mock.invocationCallOrder[0],
    );
    expect(screen.getByText("voiceRecordings.keptFor 90")).toBeTruthy();
  });

  it("keeps nothing for a parent who declines", async () => {
    await asked();

    tap("consent.decline");

    expect((await keepSwitch()).getAttribute("aria-checked")).toBe("false");
    expect(signInAgain).not.toHaveBeenCalled();
    expect(api.keepRecordings).not.toHaveBeenCalled();
  });

  it("keeps nothing for a parent who did not sign in again", async () => {
    signInAgain.mockRejectedValueOnce(WINDOW_CLOSED);
    await asked();

    tap("consent.agree");

    await waitFor(() => expect(signInAgain).toHaveBeenCalled());
    expect(api.keepRecordings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [401, "sign_in_stale", "consent.signIn"],
    [403, "sign_in_other_account", "consent.otherAccount"],
    [400, "notice_unknown", "consent.notice"],
    [422, "invalid", "learners.failed"],
  ])(
    "asks to try again when the server refuses with %i %s, and keeps them on the next try",
    async (status, code, message) => {
      api.keepRecordings
        .mockRejectedValueOnce(refused(status, code))
        .mockResolvedValueOnce({
          noticeVersion: 1,
          retentionDays: 30,
          grantedAt: 9,
        });
      await asked();

      tap("consent.agree");

      expect((await screen.findByRole("alert")).textContent).toBe(message);
      expect(screen.getByText(recordingsNotice(30))).toBeTruthy();

      tap("consent.agree");

      await waitFor(() =>
        expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
          "true",
        ),
      );
      expect(api.keepRecordings).toHaveBeenCalledTimes(2);
    },
  );
});

describe("turning recordings off", () => {
  async function asked(recordings: Recording[] = KEPT) {
    open(keeping(30, recordings));
    fireEvent.click(await keepSwitch());
    return screen.findByRole("alertdialog");
  }

  it("asks whether to delete what was kept, and changes nothing yet", async () => {
    await asked();

    expect(api.stopKeepingRecordings).not.toHaveBeenCalled();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("stops and deletes what was kept, asking again while there is more", async () => {
    api.stopKeepingRecordings
      .mockResolvedValueOnce({ deleted: 100, more: true })
      .mockResolvedValueOnce({ deleted: 1, more: false });
    await asked();

    tap("voiceRecordings.stopDelete");

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "false",
      ),
    );
    expect(api.stopKeepingRecordings).toHaveBeenCalledTimes(2);
    expect(api.stopKeepingRecordings).toHaveBeenCalledWith(ADA, true);
    expect(screen.queryByText(whenOf(FIRST_AT, "en"))).toBeNull();
  });

  it("stops and leaves what was kept to expire", async () => {
    await asked();

    tap("voiceRecordings.stopKeep");

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "false",
      ),
    );
    expect(api.stopKeepingRecordings).toHaveBeenCalledTimes(1);
    expect(api.stopKeepingRecordings).toHaveBeenCalledWith(ADA, false);
    expect(screen.getByText(whenOf(FIRST_AT, "en"))).toBeTruthy();
  });

  it("changes nothing when the parent cancels", async () => {
    await asked();

    tap("learners.cancel");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.stopKeepingRecordings).not.toHaveBeenCalled();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("stays on, and asks again, when stopping fails", async () => {
    api.stopKeepingRecordings.mockRejectedValueOnce(new Error("offline"));
    await asked();

    tap("voiceRecordings.stopKeep");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "learners.failed",
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});

describe("hearing a kept recording", () => {
  const audio = new Blob(["RIFF"], { type: "audio/wav" });

  async function playing() {
    api.recordingAudio.mockResolvedValue(audio);
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));
    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.play",
      }),
    );
    return waitFor(() => {
      const element = document.querySelector("audio");
      if (!element) throw new Error("no audio yet");
      return element;
    });
  }

  it("fetches it with the session and plays it from a blob", async () => {
    const element = await playing();

    expect(api.recordingAudio).toHaveBeenCalledWith(ADA, "s1");
    expect(URL.createObjectURL).toHaveBeenCalledWith(audio);
    expect(element.getAttribute("src")).toBe("blob:audio-1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("lets go of the blob once it has played", async () => {
    const element = await playing();

    fireEvent.ended(element);

    await waitFor(() => expect(document.querySelector("audio")).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-1");
  });

  it("lets go of the blob when the parent stops it", async () => {
    await playing();

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.stop",
      }),
    );

    await waitFor(() => expect(document.querySelector("audio")).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-1");
  });

  it("lets go of the blob when the recording is deleted while it plays", async () => {
    await playing();

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.delete",
      }),
    );

    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-1"),
    );
  });

  it("plays one at a time", async () => {
    await playing();

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT - 86_400_000, "en"))).getByRole("button", {
        name: "voiceRecordings.play",
      }),
    );

    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-1"),
    );
    expect(document.querySelectorAll("audio")).toHaveLength(1);
    expect(api.recordingAudio).toHaveBeenLastCalledWith(ADA, "s2");
  });

  it("says when the recording is gone", async () => {
    api.recordingAudio.mockRejectedValueOnce(refused(404, "recording_gone"));
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.play",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "voiceRecordings.gone",
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("says when it would not play", async () => {
    api.recordingAudio.mockRejectedValueOnce(new Error("offline"));
    open(keeping(30, KEPT));
    await screen.findByText(whenOf(FIRST_AT, "en"));

    fireEvent.click(
      within(rowOf(whenOf(FIRST_AT, "en"))).getByRole("button", {
        name: "voiceRecordings.play",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "voiceRecordings.playFailed",
    );
  });
});
