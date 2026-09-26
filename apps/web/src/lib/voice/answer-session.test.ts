import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeptAnswer } from "./answer-store";
import { UNANSWERED } from "./send-answer";

// A signed-in child's answer sent through the app's own session.ts and voice-api.ts, with
// graspy's server answering as scripted.
const { googleIdToken } = vi.hoisted(() => ({
  googleIdToken: vi.fn<(fresh: boolean) => Promise<string | null>>(),
}));
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));
vi.mock("@/lib/device-id", async (actual) => ({
  ...(await actual<typeof import("@/lib/device-id")>()),
  fingerprint: async () => null,
}));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));
vi.mock("./audio-format", () => ({ audioFormat: () => "mp3" }));

type SessionAnswer = "issued" | "empty" | "unchecked" | "refused";
type VoiceAnswer = "marks" | "refuses" | "fails" | "busy";
const graspy = {
  session: "issued" as SessionAnswer,
  voice: "marks" as VoiceAnswer,
};

const SESSION_ANSWERS: Record<SessionAnswer, () => Response> = {
  issued: () => Response.json({ token: "session-token", expiresIn: 3600 }),
  empty: () => Response.json({ token: "", expiresIn: 3600 }),
  unchecked: () =>
    Response.json(
      {
        detail: {
          error: "Sign-in could not be checked. Try again.",
          code: "sign_in_unchecked",
        },
      },
      { status: 503 },
    ),
  refused: () =>
    Response.json(
      {
        detail: { error: "The sign-in is not valid.", code: "sign_in_invalid" },
      },
      { status: 401 },
    ),
};

const CREATED = {
  sample_id: "gvm_1",
  state: "awaiting_audio",
  upload_path: "/api/voice/samples/gvm_1/audio",
};
const VOICE_ANSWERS: Record<VoiceAnswer, () => Response> = {
  marks: () => Response.json(CREATED),
  refuses: () =>
    Response.json(
      { detail: "That prompt is not asked.", code: "unsupported_prompt" },
      { status: 400 },
    ),
  fails: () => new Response("Bad gateway", { status: 502 }),
  // As app/security/rate_limit.py answers.
  busy: () =>
    Response.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    ),
};

async function graspyFetch(input: string | URL): Promise<Response> {
  const url = String(input);
  if (url.endsWith("/session")) return SESSION_ANSWERS[graspy.session]();
  if (url.endsWith("/voice/samples")) return VOICE_ANSWERS[graspy.voice]();
  if (url.endsWith("/evaluation")) {
    return Response.json({ sample_id: "gvm_1", state: "complete" });
  }
  return Response.json({ sample_id: "gvm_1", state: "ready" });
}

function stubSignedIn() {
  const local = new Map([
    [
      "graspy.account",
      JSON.stringify({ uid: "uid1", learner: { id: "l1", name: "Ada" } }),
    ],
  ]);
  const storage = (store: Map<string, string>) => ({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", {
    localStorage: storage(local),
    sessionStorage: storage(new Map()),
    location: { assign: vi.fn() },
  });
}

const answer: KeptAnswer = {
  key: "key-1",
  learner: "uid1/l1",
  metadata: {} as KeptAnswer["metadata"],
  wav: new Blob(["RIFF"], { type: "audio/wav" }),
  keptAt: 1,
};
let kept: Map<string, KeptAnswer>;
const keeping = {
  keep: async (a: KeptAnswer) => void kept.set(a.key, a),
  settle: async (a: KeptAnswer) => void kept.delete(a.key),
};

async function sent() {
  vi.resetModules();
  const [{ sendAnswer }, api] = await Promise.all([
    import("./send-answer"),
    import("./voice-api"),
  ]);
  return sendAnswer(answer, api, keeping, async () => {});
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubSignedIn();
  vi.stubGlobal("fetch", graspyFetch);
  googleIdToken.mockReset();
  googleIdToken.mockResolvedValue("id-token");
  graspy.session = "issued";
  graspy.voice = "marks";
  kept = new Map([[answer.key, answer]]);
});

describe("a child's answer", () => {
  it.each([
    ["graspy could not check the sign-in with Google", "unchecked"],
    ["graspy refuses the session", "refused"],
    ["graspy issues an empty session", "empty"],
  ] as const)("stays on the device when %s", async (_, session) => {
    graspy.session = session;

    await expect(sent()).resolves.toEqual(UNANSWERED);
    expect(kept.has(answer.key)).toBe(true);
  });

  it.each([
    [
      "Firebase is busy",
      Object.assign(new Error("Firebase: Error (auth/too-many-requests)."), {
        code: "auth/too-many-requests",
      }),
    ],
    [
      "Google refuses the sign-in",
      Object.assign(new Error("Firebase: Error (auth/user-token-expired)."), {
        code: "auth/user-token-expired",
      }),
    ],
  ])("stays on the device when %s", async (_, failure) => {
    googleIdToken.mockRejectedValue(failure);

    await expect(sent()).resolves.toEqual(UNANSWERED);
    expect(kept.has(answer.key)).toBe(true);
  });

  it.each([
    ["fails on its side", "fails"],
    ["is rate limited", "busy"],
  ] as const)("stays on the device when the voice API %s", async (_, voice) => {
    graspy.voice = voice;

    await expect(sent()).resolves.toMatchObject({
      kind: "kept",
      status: voice === "fails" ? 502 : 429,
    });
    expect(kept.has(answer.key)).toBe(true);
  });

  it("is settled when the voice API refuses it", async () => {
    graspy.voice = "refuses";

    await expect(sent()).resolves.toEqual({
      kind: "refused",
      code: "unsupported_prompt",
      status: 400,
    });
    expect(kept.has(answer.key)).toBe(false);
  });

  it("is marked and let go when everything answers", async () => {
    await expect(sent()).resolves.toMatchObject({ kind: "marked" });
    expect(kept.has(answer.key)).toBe(false);
  });
});
