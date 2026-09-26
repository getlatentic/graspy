import { beforeEach, describe, expect, it, vi } from "vitest";

type Respond = (url: string, init?: RequestInit) => Promise<Response>;

// A plain function, not vi.fn: a spy keeps a rejected promise of its own, unhandled.
const wire = vi.hoisted(() => ({
  calls: [] as Array<[string, RequestInit | undefined]>,
  respond: (async () => new Response(null, { status: 500 })) as (
    url: string,
    init?: RequestInit,
  ) => Promise<Response>,
}));
vi.mock("./audio-format", () => ({ audioFormat: () => "mp3" }));
vi.mock("@/lib/api/session", () => ({
  fetchWithSession: (url: string, init?: RequestInit) => {
    wire.calls.push([url, init]);
    return wire.respond(url, init);
  },
}));
const fetchWithSession = {
  mockResolvedValue: (response: Response) => {
    wire.respond = async () => response;
  },
  mockImplementation: (next: Respond) => {
    wire.respond = next;
  },
};
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const api = await import("./voice-api");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const called = () => wire.calls.at(-1)!;

beforeEach(() => {
  wire.calls.length = 0;
});

describe("the voice API client", () => {
  it("asks for the next step of a class, in a language, for a chosen lesson", async () => {
    fetchWithSession.mockResolvedValue(json({ move: { kind: "rest" } }));
    await api.lessonMove("primary_4", "yo", "plan.mul.table-7");
    expect(called()[0]).toBe(
      "https://api.test/api/voice/lesson?learner_class=primary_4&language=yo&plan=plan.mul.table-7",
    );
  });

  it("asks for a class's lessons", async () => {
    fetchWithSession.mockResolvedValue(json({ day: "d", lessons: [] }));
    await api.catalogue("primary_2", "en");
    expect(called()[0]).toBe(
      "https://api.test/api/voice/catalogue?learner_class=primary_2&language=en",
    );
  });

  it("says a taught line was heard", async () => {
    fetchWithSession.mockResolvedValue(json({}));
    const heard = { plan_id: "p", event_id: "e", learner_class: "primary_4" };
    await api.lessonEventHeard(heard);
    const [url, init] = called();
    expect(url).toBe("https://api.test/api/voice/lesson/events");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(heard);
  });

  it("creates a recording under its Idempotency-Key", async () => {
    fetchWithSession.mockResolvedValue(
      json(
        { sample_id: "gvm_1", state: "awaiting_audio", upload_path: "/x" },
        201,
      ),
    );
    const metadata = { prompt_id: "p" } as never;
    await api.createSample("key-1", metadata);
    const [url, init] = called();
    expect(url).toBe("https://api.test/api/voice/samples");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("key-1");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init?.body))).toEqual(metadata);
  });

  it("puts the audio at the path the server named, as WAV", async () => {
    fetchWithSession.mockResolvedValue(json({ state: "ready" }));
    const wav = new Blob(["RIFF"], { type: "audio/wav" });
    await api.uploadAudio("/api/voice/samples/gvm_1/audio", wav);
    const [url, init] = called();
    expect(url).toBe("https://api.test/api/voice/samples/gvm_1/audio");
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("audio/wav");
    expect(init?.body).toBe(wav);
  });

  it("marks a recording and reads its reply and the teacher's lines as audio", async () => {
    fetchWithSession.mockResolvedValue(json({ state: "complete" }));
    await api.evaluate("gvm_1");
    expect(called()[0]).toBe(
      "https://api.test/api/voice/samples/gvm_1/evaluation",
    );
    expect(called()[1]?.method).toBe("POST");

    fetchWithSession.mockImplementation(
      async () => new Response(new Blob(["OggS"])),
    );
    await api.replyAudio("gvm_1");
    expect(called()[0]).toBe(
      "https://api.test/api/voice/samples/gvm_1/reply-audio?format=mp3",
    );
    await api.teacherAudio("no-speech", "pcm");
    expect(called()[0]).toBe(
      "https://api.test/api/voice/teacher-audio/no-speech?language=pcm&format=mp3",
    );
  });

  it.each([
    [409, "step_not_offered"],
    [409, "audio_not_ready"],
    [409, "unsupported_prompt"],
    [409, "idempotency_conflict"],
    [422, "no_speech"],
    [502, "provider_failure"],
    [409, "learner_required"],
  ])("names a %i refusal by its code %s", async (status, code) => {
    fetchWithSession.mockResolvedValue(
      json({ detail: "refused", code }, status),
    );
    const error = await api.evaluate("gvm_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(api.VoiceError);
    expect(error).toMatchObject({ status, code, message: "refused" });
  });

  it("reads the code of a refusal raised before the route", async () => {
    fetchWithSession.mockResolvedValue(
      json(
        {
          detail: {
            error: "Voice lessons run only on the Worker",
            code: "voice_unavailable",
          },
        },
        503,
      ),
    );
    await expect(api.catalogue("primary_1", "en")).rejects.toMatchObject({
      status: 503,
      code: "voice_unavailable",
    });
  });

  it("tells a network failure from a refusal", async () => {
    fetchWithSession.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = (await api
      .evaluate("gvm_1")
      .catch((e: unknown) => e)) as InstanceType<typeof api.VoiceError>;
    expect(error.unreachable).toBe(true);
    expect(error.code).toBeNull();
  });
});
