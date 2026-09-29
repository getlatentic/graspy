import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithSession = vi.fn();
vi.mock("@/lib/api/session", () => ({ fetchWithSession }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const api = await import("./voice-recordings-api");

const VOICE = "https://api.test/api/account/learners/a1b2c3d4e5f6/voice";
const LEARNER = "a1b2c3d4e5f6";

function answers(status: number, body?: unknown) {
  fetchWithSession.mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    blob: async () => body,
  });
}

const sent = (call = 0) => {
  const [url, init] = fetchWithSession.mock.calls[call];
  return {
    url,
    method: init?.method ?? "GET",
    body: init?.body && JSON.parse(init.body),
  };
};

beforeEach(() => fetchWithSession.mockReset());

describe("a learner's voice recordings", () => {
  it("are read with the consent and the kept recordings", async () => {
    const overview = {
      consent: null,
      recordings: [],
      nextBefore: null,
      nextBeforeId: null,
    };
    answers(200, overview);

    await expect(api.getVoice(LEARNER)).resolves.toEqual(overview);
    expect(sent()).toMatchObject({ url: VOICE, method: "GET" });
  });

  it("are paged by where the last one shown was, its time and its id", async () => {
    answers(200, {
      consent: null,
      recordings: [],
      nextBefore: null,
      nextBeforeId: null,
    });

    await api.getVoice(LEARNER, { before: 1700, beforeId: "gvm_a b" });

    expect(sent().url).toBe(`${VOICE}?before=1700&beforeId=gvm_a%20b`);
  });

  it("are kept once a parent agrees, with the days and the fresh sign-in", async () => {
    answers(200, { noticeVersion: 1, retentionDays: 90, grantedAt: 3 });

    await api.keepRecordings(LEARNER, 1, 90, "fresh-token");

    expect(sent()).toMatchObject({
      url: `${VOICE}/consent`,
      method: "PUT",
      body: {
        noticeVersion: 1,
        retentionDays: 90,
        firebaseIdToken: "fresh-token",
      },
    });
  });

  it("stop being kept, with or without what was kept", async () => {
    answers(200, { deleted: 0, more: false });
    await api.stopKeepingRecordings(LEARNER, false);
    await api.stopKeepingRecordings(LEARNER, true);

    expect(sent(0)).toMatchObject({
      url: `${VOICE}/consent`,
      method: "DELETE",
    });
    expect(sent(1)).toMatchObject({
      url: `${VOICE}/consent?deleteRecordings=true`,
      method: "DELETE",
    });
  });

  it("are deleted one at a time or all at once", async () => {
    answers(204);
    await api.deleteRecording(LEARNER, "s1");
    answers(200, { deleted: 2, more: true });
    await expect(api.deleteRecordings(LEARNER)).resolves.toEqual({
      deleted: 2,
      more: true,
    });

    expect(sent(0)).toMatchObject({
      url: `${VOICE}/recordings/s1`,
      method: "DELETE",
    });
    expect(sent(1)).toMatchObject({
      url: `${VOICE}/recordings`,
      method: "DELETE",
    });
  });
});

describe("a kept recording's audio", () => {
  it("is fetched as a blob", async () => {
    const audio = new Blob(["RIFF"], { type: "audio/wav" });
    answers(200, audio);

    await expect(api.recordingAudio(LEARNER, "s1")).resolves.toBe(audio);
    expect(sent().url).toBe(`${VOICE}/recordings/s1/audio`);
  });

  it("is refused with the server's code when it is gone", async () => {
    answers(404, { detail: { error: "Gone", code: "recording_gone" } });

    await expect(api.recordingAudio(LEARNER, "s1")).rejects.toMatchObject({
      status: 404,
      data: { detail: { code: "recording_gone" } },
    });
  });

  it("fails as a network error when nothing answers", async () => {
    fetchWithSession.mockRejectedValueOnce(new TypeError("offline"));

    const failed = await api
      .recordingAudio(LEARNER, "s1")
      .catch((error: unknown) => error);

    expect(failed).toHaveProperty("status", 0);
  });
});

describe("deleting until done", () => {
  it("asks again while there is more, and counts what went", async () => {
    const step = vi
      .fn()
      .mockResolvedValueOnce({ deleted: 100, more: true })
      .mockResolvedValueOnce({ deleted: 100, more: true })
      .mockResolvedValueOnce({ deleted: 7, more: false });

    await expect(api.untilDone(step)).resolves.toBe(207);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it("asks once when there is no more", async () => {
    const step = vi.fn().mockResolvedValue({ deleted: 0, more: false });

    await expect(api.untilDone(step)).resolves.toBe(0);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("fails rather than ask for ever when nothing goes yet there is more", async () => {
    const step = vi.fn().mockResolvedValue({ deleted: 0, more: true });

    await expect(api.untilDone(step)).rejects.toThrow("no progress");
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("stops at the call that fails", async () => {
    const step = vi
      .fn()
      .mockResolvedValueOnce({ deleted: 5, more: true })
      .mockRejectedValueOnce(new Error("offline"));

    await expect(api.untilDone(step)).rejects.toThrow("offline");
  });
});
