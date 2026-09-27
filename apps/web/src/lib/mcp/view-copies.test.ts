import { beforeEach, describe, expect, it, vi } from "vitest";
import { keepView, keptSandboxes, keptView } from "./view-copies";

const LESSON = "ui://graspy/lesson";
const PRACTICE = "ui://graspy/practice";
const SANDBOX = "/ui-sandbox/0123456789abcdef/";
const EARLIER = "/ui-sandbox/fedcba9876543210/";
const page = (sandbox: string) => ({
  html: "<html>lesson</html>",
  title: "Lesson",
  sandbox,
});

let store: Map<string, string>;

function stubStorage(refused = false) {
  store = new Map();
  const refuse = () => {
    if (refused) throw new DOMException("denied", "SecurityError");
  };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (refuse(), store.get(key) ?? null),
      setItem: (key: string, value: string) => (
        refuse(),
        store.set(key, value)
      ),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        refuse();
        return store.size;
      },
    },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubStorage();
});

describe("a view's kept page", () => {
  it("is the page last kept", () => {
    keepView(LESSON, page(EARLIER));
    keepView(LESSON, page(SANDBOX));

    expect(keptView(LESSON)).toEqual(page(SANDBOX));
  });

  it.each([
    ["kept before pages named their sandbox", { html: "<html></html>" }],
    ["not a page", ["<html></html>"]],
  ])("is none when %s", (_, kept) => {
    store.set(`graspy.view.${LESSON}`, JSON.stringify(kept));

    expect(keptView(LESSON)).toBeNull();
  });

  it("is none when unreadable", () => {
    store.set(`graspy.view.${LESSON}`, "{");

    expect(keptView(LESSON)).toBeNull();
  });

  it("is none, and keeping fails quietly, where storage is refused", () => {
    stubStorage(true);

    keepView(LESSON, page(SANDBOX));

    expect(keptView(LESSON)).toBeNull();
    expect(keptSandboxes()).toEqual(new Set());
  });
});

describe("the sandboxes kept pages open in", () => {
  it("are each kept page's, and nothing else stored", () => {
    keepView(LESSON, page(SANDBOX));
    keepView(PRACTICE, page(EARLIER));
    store.set("graspy.other", JSON.stringify(page("/elsewhere/")));
    store.set("graspy.view.ui://graspy/passage", "{");

    expect(keptSandboxes()).toEqual(new Set([SANDBOX, EARLIER]));
  });
});
