const DB_NAME = "graspy-db";
export const SERVER = "http://localhost:8081";
const API = `${SERVER}/api`;
// Each test is a device of its own: the browser's fingerprint, the same in
// every test, would give them all one record on the server.
const DEVICE_KEY = "graspy_device_id";

// As version 1 saved it: everything by subject name, and no plan id.
export const OLD_PLAN = {
  id: "current",
  country: "Nigeria",
  language: "English",
  gradeLevel: "JSS 1",
  subjects: ["English Studies", "Mathematics"],
  topics: {
    "English Studies": ["Reading Comprehension", "Grammar"],
    Mathematics: ["Number and Place Value", "Fractions", "Linear Equations"],
  },
  assessment: { nextSubject: "Mathematics" },
  createdAt: 1790131692502,
  updatedAt: 1790131901466,
};
export const OLD_PLAN_ID = "plan-1790131692502";

const PROFILE = {
  id: "e2e",
  country: "NG",
  language: "en",
  gradeLevel: "JSS 1",
  preferredSubjects: ["English Studies", "Mathematics"],
  onboardingCompleted: true,
};

export function slide(title: string, bodyMd: string) {
  return {
    slideType: "concept_introduction",
    title,
    bodyMd,
    assessment: {
      type: "choice",
      prompt: "What is 2 + 2?",
      options: ["4", "5"],
      answerIndex: 0,
    },
  };
}

function lessonFor(
  topic: string,
  slides = [slide(topic, "Body.")],
  keyPoints: string[] = [],
) {
  return {
    title: topic,
    content: "",
    keyPoints,
    slides,
    examples: [],
    practice: {
      question: "",
      options: [],
      answerIndex: -1,
      correctFeedback: "",
      incorrectFeedback: "",
    },
    progress: { current: 0, total: 1 },
  };
}

function sessionFor(subject: string, topic: string) {
  return {
    id: `session-${topic}`,
    subject,
    topic,
    topicIndex: 0,
    totalTopics: 1,
    explanation: "",
    practice: {
      question: "",
      options: [],
      answerIndex: 0,
      correctFeedback: "",
      incorrectFeedback: "",
    },
    phase: "explanation",
  };
}

export function oldKeptLesson(
  topic: string,
  index: number,
  slides = [slide(topic, "Body.")],
  keyPoints: string[] = [],
): Record<string, string> {
  return {
    [`lesson-cache:mathematics:${index}`]: JSON.stringify({
      subjectSlug: "mathematics",
      subjectName: "Mathematics",
      topic,
      topicIndex: index,
      lesson: lessonFor(topic, slides, keyPoints),
      session: sessionFor("Mathematics", topic),
      savedAt: 1,
      format: 3,
    }),
  };
}

export const MODEL = { timeout: 180_000 };

export function serverIsUp(): void {
  cy.request({ url: `${API}/health`, failOnStatusCode: false }).then(
    (response) => {
      expect(
        response.status,
        `the API at ${API} (start it: npm run dev in apps/server)`,
      ).to.equal(200);
    },
  );
}

// Frozen as each version shipped it.
function schemaOf(version: 1 | 3, db: IDBDatabase): void {
  db.createObjectStore("curriculum", { keyPath: "id" });
  const chat = db.createObjectStore("chat-history", { keyPath: "id" });
  chat.createIndex("timestamp", "timestamp");
  if (version < 3) return;
  chat.createIndex("threadId", "threadId");
  db.createObjectStore("chat-threads", { keyPath: "id" });
  for (const name of ["lessons", "progress"]) {
    const store = db.createObjectStore(name, {
      keyPath: ["planId", "subjectSlug", "topicIndex", "topic"],
    });
    store.createIndex("plan", "planId");
    store.createIndex("subject", ["planId", "subjectSlug"]);
  }
}

// Set up from the landing page, which opens no database.
export function oldDevice(
  plan: object,
  local: Record<string, string>,
  version: 1 | 3 = 1,
): void {
  cy.visit("/");
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve, reject) => {
        win.localStorage.clear();
        win.localStorage.setItem(
          DEVICE_KEY,
          `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        );
        win.localStorage.setItem(
          "graspy_user_profile",
          JSON.stringify(PROFILE),
        );
        for (const [key, value] of Object.entries(local)) {
          win.localStorage.setItem(key, value);
        }
        const wiped = win.indexedDB.deleteDatabase(DB_NAME);
        wiped.onblocked = () => reject(new Error("The database is open"));
        wiped.onerror = () => reject(wiped.error);
        wiped.onsuccess = () => {
          const open = win.indexedDB.open(DB_NAME, version);
          open.onupgradeneeded = () => {
            schemaOf(version, open.result);
            open.transaction!.objectStore("curriculum").put(plan);
          };
          open.onsuccess = () => {
            open.result.close();
            resolve();
          };
          open.onerror = () => reject(open.error);
        };
      }),
  );
}

type TopicKey = [string, string, number, string];

interface Stored {
  version: number;
  plan: Record<string, unknown> & { planId?: string };
  progress: TopicKey[];
  lessons: TopicKey[];
  // Left in the device's own stores, which the app imports once and clears.
  deviceRows: number;
  localKeys: string[];
}

interface Device {
  version: number;
  plan: Stored["plan"];
  deviceRows: number;
  localKeys: string[];
  deviceId: string | null;
}

function readDevice(win: Window): Promise<Device> {
  return new Cypress.Promise<Device>((resolve, reject) => {
    const open = win.indexedDB.open(DB_NAME);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const names = ["lessons", "progress", "practice"].filter((name) =>
        db.objectStoreNames.contains(name),
      );
      const tx = db.transaction(["curriculum", ...names], "readonly");
      const plan = tx.objectStore("curriculum").get("current");
      const counts = names.map((name) => tx.objectStore(name).count());
      tx.oncomplete = () => {
        db.close();
        resolve({
          version: db.version,
          plan: plan.result,
          deviceRows: counts.reduce((sum, count) => sum + count.result, 0),
          localKeys: Object.keys(win.localStorage).sort(),
          deviceId: win.localStorage.getItem(DEVICE_KEY),
        });
      };
    };
  });
}

interface Mark {
  planId: string;
  subjectSlug: string;
  topicIndex: number;
  topic: string;
  lessonId?: string | null;
  learntAt?: number | null;
}

const keyOf = (mark: Mark): TopicKey => [
  mark.planId,
  mark.subjectSlug,
  mark.topicIndex,
  mark.topic,
];

function serverRecord(
  deviceId: string,
  planId: string,
): Cypress.Chainable<{ topics: Mark[]; answers: unknown[] }> {
  return cy
    .request("POST", `${API}/session`, { deviceId })
    .then(({ body }) =>
      cy.request({
        url: `${API}/learner`,
        qs: { planId },
        headers: { Authorization: `Bearer ${body.token}` },
      }),
    )
    .its("body");
}

export function stored(): Cypress.Chainable<Stored> {
  return cy
    .window()
    .then(readDevice)
    .then((device) => {
      const { deviceId, ...kept } = device;
      const planId = device.plan?.planId;
      if (!deviceId || !planId) {
        return cy.wrap({ ...kept, progress: [], lessons: [] } as Stored);
      }
      return serverRecord(deviceId, planId).then(({ topics }): Stored => ({
        ...kept,
        progress: topics.filter((mark) => mark.learntAt).map(keyOf),
        lessons: topics.filter((mark) => mark.lessonId).map(keyOf),
      }));
    });
}

// Storage settles after the page, and the model finishes lessons late.
export function eventually(
  check: (device: Stored) => void,
  { timeout } = { timeout: 10_000 },
): void {
  // The deadline starts when the reading does, not when the test queued it:
  // commands before it may have waited on the model for minutes.
  let until = 0;
  const attempt = (): void => {
    stored().then((device) => {
      until ||= Date.now() + timeout;
      try {
        check(device);
      } catch (error) {
        if (Date.now() > until) throw error;
        cy.wait(500);
        attempt();
      }
    });
  };
  attempt();
}

let connected = true;

// The browser's emulation does not reach a service worker's requests, so
// serverFollowsTheConnection() also cuts the server off at Cypress's proxy.
export function online(connection: boolean): void {
  connected = connection;
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Network.enable",
    }),
  ).then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Network.emulateNetworkConditions",
      params: {
        offline: !connection,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      },
    }),
  );
}

export function serverFollowsTheConnection(): void {
  connected = true;
  cy.intercept(`${SERVER}/**`, (request) => {
    if (!connected) request.destroy();
  });
}
