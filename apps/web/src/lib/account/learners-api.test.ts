import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithSession = vi.fn();
vi.mock("@/lib/api/session", () => ({ fetchWithSession }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const api = await import("./learners-api");

const ADA = {
  id: "a1b2c3d4e5f6",
  name: "Ada",
  createdAt: 1,
  serviceConsent: null,
  voiceConsent: null,
};
const PROOF = { noticeVersion: 1, firebaseIdToken: "fresh-token" };

function answers(status: number, body?: unknown) {
  fetchWithSession.mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  });
}

const sent = () => {
  const [url, init] = fetchWithSession.mock.calls[0];
  return { url, method: init.method, body: init.body && JSON.parse(init.body) };
};

beforeEach(() => fetchWithSession.mockReset());

describe("the account's learners", () => {
  it("are listed", async () => {
    answers(200, { learners: [ADA] });

    await expect(api.listLearners()).resolves.toEqual([ADA]);
    expect(sent()).toMatchObject({
      url: "https://api.test/api/account/learners",
      method: "GET",
    });
  });

  it("are added by their parent, guardian or themselves, who agree for them", async () => {
    answers(201, ADA);

    await expect(api.addLearner("Ada", PROOF)).resolves.toEqual(ADA);
    expect(sent()).toMatchObject({
      url: "https://api.test/api/account/learners",
      method: "POST",
      body: { name: "Ada", guardian: true, consent: PROOF },
    });
  });

  it("each need a parent's agreement, which is recorded for one added without", async () => {
    answers(200, { noticeVersion: 1, grantedAt: 5 });

    await expect(api.agreeToService(ADA.id, PROOF)).resolves.toEqual({
      noticeVersion: 1,
      grantedAt: 5,
    });
    expect(sent()).toMatchObject({
      url: `https://api.test/api/account/learners/${ADA.id}/consent`,
      method: "PUT",
      body: PROOF,
    });
  });

  it("are renamed and removed by id", async () => {
    answers(200, { ...ADA, name: "Ada L." });
    await api.renameLearner(ADA.id, "Ada L.");
    expect(sent()).toMatchObject({
      url: `https://api.test/api/account/learners/${ADA.id}`,
      method: "PATCH",
      body: { name: "Ada L." },
    });

    fetchWithSession.mockReset();
    answers(200, { learners: [] });
    await expect(api.removeLearner(ADA.id)).resolves.toEqual([]);
    expect(sent().method).toBe("DELETE");
  });

  it("each have a session, which with the device's id takes in its record", async () => {
    answers(200, { token: "t", expiresIn: 60, learner: ADA });

    await api.learnerSession(ADA.id, "device-1");

    expect(sent()).toMatchObject({
      url: `https://api.test/api/account/learners/${ADA.id}/session`,
      method: "POST",
      body: { deviceId: "device-1" },
    });
  });

  it("go with the account when it is deleted", async () => {
    answers(204);

    await expect(api.deleteAccount()).resolves.toBeUndefined();
    expect(sent()).toMatchObject({
      url: "https://api.test/api/account",
      method: "DELETE",
    });
  });
});
