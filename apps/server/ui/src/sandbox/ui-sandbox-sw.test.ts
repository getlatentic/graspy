import { describe, expect, it } from "vitest";
import { ORIGIN, SandboxWorker } from "./worker-harness";

const LIST = `${ORIGIN}/views/precache.json`;
const LESSON = ["/views/assets/lesson-a.js", "/views/assets/shared-a.js"];
const PRACTICE = ["/views/assets/practice-a.js", "/views/assets/shared-a.css"];
const FONT = "/views/assets/inter-a.woff2";
const BUILD = [...LESSON, ...PRACTICE, FONT];

function deployed(paths: string[] = BUILD): SandboxWorker {
  const worker = new SandboxWorker();
  worker.list(paths);
  for (const path of paths) worker.serve(path, path);
  return worker;
}

const fetchesOf = (worker: SandboxWorker, path: string) =>
  worker.fetched.filter((fetch) => fetch.url === `${ORIGIN}${path}`).length;

describe("the sandbox's service worker", () => {
  it("caches every view's files once any one view has loaded", async () => {
    const worker = deployed();

    await worker.keep(
      `${ORIGIN}/ui-sandbox?host=x`,
      ...LESSON.map((path) => `${ORIGIN}${path}`),
    );

    expect(worker.assets().sort()).toEqual([...BUILD].sort());
  });

  it("opens a view never shown when there is no connection", async () => {
    const worker = deployed();
    await worker.keep(...LESSON.map((path) => `${ORIGIN}${path}`));
    worker.online = false;

    const response = await worker.request(`${ORIGIN}${PRACTICE[0]}`);

    expect(await response?.text()).toBe(PRACTICE[0]);
  });

  it("asks for the list past the browser's cache, which it may have kept", async () => {
    const worker = deployed();

    await worker.keep();

    expect(worker.fetched.find((fetch) => fetch.url === LIST)?.cache).toBe(
      "no-cache",
    );
  });

  it("fetches only the files it has not cached, which never change", async () => {
    const worker = deployed();

    await worker.keep();
    await worker.keep();

    for (const path of BUILD) expect(fetchesOf(worker, path)).toBe(1);
  });

  it("makes one pass however many sandboxes ask at once", async () => {
    const worker = deployed();

    await Promise.all([worker.keep(), worker.keep(), worker.keep()]);

    expect(fetchesOf(worker, "/views/precache.json")).toBe(1);
    for (const path of BUILD) expect(fetchesOf(worker, path)).toBe(1);
  });

  it("caches only this origin's view files, whatever the list says", async () => {
    const listed = [
      "https://elsewhere.test/views/assets/x.js",
      "/api/lessons",
      "/views/lesson.html",
      "/ui-sandbox",
      42,
      FONT,
    ];
    const worker = new SandboxWorker();
    worker.list(listed);
    for (const path of [
      "/api/lessons",
      "/views/lesson.html",
      "/ui-sandbox",
      FONT,
    ])
      worker.serve(path, path);

    await worker.keep();

    expect(worker.assets()).toEqual([FONT]);
    expect(worker.fetched.map((fetch) => fetch.url)).toEqual([
      LIST,
      `${ORIGIN}${FONT}`,
    ]);
  });

  it("keeps going past a file that fails, and fetches it on the next pass", async () => {
    const worker = deployed();
    worker.network.delete(`${ORIGIN}${FONT}`);

    await worker.keep();
    expect(worker.assets()).toEqual(BUILD.filter((path) => path !== FONT));

    worker.serve(FONT, FONT);
    await worker.keep();
    expect(worker.assets()).toContain(FONT);
  });

  it("changes nothing without a connection", async () => {
    const worker = deployed();
    await worker.keep();
    worker.online = false;

    await worker.keep();

    expect(worker.assets().sort()).toEqual([...BUILD].sort());
  });

  it("keeps a past build's files for the pages kept from it", async () => {
    const worker = deployed(["/views/assets/lesson-old.js"]);
    await worker.keep();
    worker.list(BUILD);
    for (const path of BUILD) worker.serve(path, path);

    await worker.keep();

    expect(worker.assets()).toContain("/views/assets/lesson-old.js");
  });

  it("drops the oldest past files beyond its cap, never the current build's", async () => {
    const past = Array.from(
      { length: 119 },
      (_, index) => `/views/assets/past-${index}.js`,
    );
    // The font, kept first and so the oldest, is in both builds.
    const worker = deployed([FONT, ...past]);
    await worker.keep();
    worker.list(BUILD);
    for (const path of BUILD) worker.serve(path, path);

    await worker.keep();

    const cached = worker.assets();
    expect(cached).toHaveLength(120);
    expect(cached).toEqual(expect.arrayContaining(BUILD));
    expect(cached).not.toContain("/views/assets/past-3.js");
    expect(cached).toContain("/views/assets/past-4.js");
  });

  it("still keeps what the sandbox page loaded when there is no list", async () => {
    const worker = new SandboxWorker();
    worker.serve(LESSON[0], "lesson");

    await worker.keep(`${ORIGIN}${LESSON[0]}`);

    expect(worker.assets()).toEqual([LESSON[0]]);
  });
});
