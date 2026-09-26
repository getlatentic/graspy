import { OLD_PLAN, SERVER, oldDevice } from "./learner-db";

// uvicorn answers every voice route 503, so the Worker's replies are stubbed at the network,
// in the shapes apps/server/src/app/voice returns.
const VOICE = `${SERVER}/api/voice`;

const PRIMARY_4 = "Primary 4 (Primary), Nigeria, age 9";

/** A learner in Primary 4 in Nigeria, or in another class or country, with a plan. */
export function learnerIn(
  level = "primary-4",
  system = "NG",
  language = "en",
): void {
  const details = {
    system,
    level,
    levelNames: { en: level },
    course: "",
    gradeLevel: PRIMARY_4,
  };
  oldDevice(
    { ...OLD_PLAN, ...details },
    {
      graspy_user_profile: JSON.stringify({
        id: "e2e",
        country: system === "NG" ? "NG" : "GH",
        language,
        preferredSubjects: ["English Studies", "Mathematics"],
        onboardingCompleted: true,
        ...details,
      }),
    },
  );
}

export const TAUGHT = {
  kind: "event",
  plan_id: "plan.mathematics.multiplication.table-7",
  event_id: "present-content",
  event: "present_content",
  subject: "mathematics",
  title: { en: "The 7 times table", yo: "Tábìlì 7", pcm: "The 7 times table" },
  say: "plan.mathematics.multiplication.table-7.present-content",
  say_text: {
    en: "Seven times eight is fifty-six.",
    yo: "Méje ìlọ́po mẹ́jọ",
    pcm: "Seven times eight na fifty-six.",
  },
  show: { en: "7 × 8 = 56", yo: "7 × 8 = 56", pcm: "7 × 8 = 56" },
  activity: null,
  reason: "next in the plan",
};

export const ASKED = {
  ...TAUGHT,
  event_id: "elicit-performance",
  event: "elicit_performance",
  say: "plan.mathematics.multiplication.table-7.elicit-performance",
  say_text: {
    en: "What is seven times eight?",
    yo: "Kí ni méje ìlọ́po mẹ́jọ?",
    pcm: "Wetin be seven times eight?",
  },
  show: { en: "7 × 8", yo: "7 × 8", pcm: "7 × 8" },
  activity: { kind: "existing", prompt_id: "mul_fact_7x8_answer" },
};

const REST = { kind: "rest", say: "finished", reason: "nothing is due today" };

export const MARKED = {
  sample_id: "gvm_e2e1",
  state: "complete",
  transcript: "fifty six",
  parsed_answer: 56,
  decision: "correct",
  feedback: "Well done! Seven times eight is fifty-six.",
  provider: "intron_sync",
  latency_ms: 900,
};

export const CATALOGUE = {
  day: "2026-09-26",
  lessons: [
    {
      plan_id: "plan.mathematics.number.counting-to-twenty",
      subject: "mathematics",
      topic: "number",
      title: {
        en: "Counting to twenty",
        yo: "Kíka dé ogún",
        pcm: "Counting reach twenty",
      },
      standing: "mastered",
      days_correct: 2,
      current: false,
    },
    {
      plan_id: TAUGHT.plan_id,
      subject: "mathematics",
      topic: "multiplication",
      title: TAUGHT.title,
      standing: "started",
      days_correct: 0,
      current: true,
    },
  ],
};

export interface Recorded {
  wav: Uint8Array | null;
}

/** The voice routes of a Worker giving a taught line, a question, then a rest. */
export function voiceServer(
  evaluation: { status: number; body: object } = { status: 200, body: MARKED },
): Recorded {
  const moves = [TAUGHT, ASKED, REST];
  const recorded: Recorded = { wav: null };
  let asked = 0;
  cy.intercept("GET", `${VOICE}/catalogue*`, CATALOGUE).as("catalogue");
  cy.intercept("GET", `${VOICE}/lesson*`, (request) => {
    const move = moves[Math.min(asked, moves.length - 1)];
    asked += 1;
    request.reply({ move, revision: asked, day: CATALOGUE.day });
  }).as("move");
  cy.intercept("POST", `${VOICE}/lesson/events`, {
    plan_id: TAUGHT.plan_id,
    event_id: TAUGHT.event_id,
  }).as("heard");
  // ",null" serves the fixture's bytes as they are: read as text, audio is spoiled.
  const speak = {
    fixture: "teacher-line.ogg,null",
    headers: { "content-type": "audio/ogg" },
  };
  cy.intercept("GET", `${VOICE}/teacher-audio/*`, speak).as("teacherAudio");
  cy.intercept("GET", `${VOICE}/samples/*/reply-audio`, speak).as("replyAudio");
  cy.intercept("POST", `${VOICE}/samples`, (request) => {
    request.reply(201, {
      sample_id: MARKED.sample_id,
      state: "awaiting_audio",
      upload_path: `/api/voice/samples/${MARKED.sample_id}/audio`,
    });
  }).as("sample");
  cy.intercept("PUT", `${VOICE}/samples/*/audio`, (request) => {
    recorded.wav = new Uint8Array(request.body as ArrayBuffer);
    request.reply({ sample_id: MARKED.sample_id, state: "ready" });
  }).as("audio");
  cy.intercept("POST", `${VOICE}/samples/*/evaluation`, (request) =>
    request.reply(evaluation.status, evaluation.body),
  ).as("evaluation");
  return recorded;
}

/**
 * Electron takes no command-line microphone, so there the fixture is played into
 * getUserMedia; Chrome is given it as its fake device (cypress.config.ts).
 */
export function visitWithMicrophone(url: string): void {
  cy.fixture("fifty-six.wav", "base64").then((spoken: string) => {
    cy.visit(url, {
      onBeforeLoad(win) {
        if (Cypress.browser.name !== "electron") return;
        const bytes = Uint8Array.from(atob(spoken), (c) => c.charCodeAt(0));
        win.navigator.mediaDevices.getUserMedia = async () => {
          const context = new win.AudioContext();
          const source = context.createBufferSource();
          source.buffer = await context.decodeAudioData(bytes.buffer.slice(0));
          source.loop = true;
          const microphone = context.createMediaStreamDestination();
          source.connect(microphone);
          source.start();
          return microphone.stream;
        };
      },
    });
  });
}

/** The recording's header, read as a WAV reader would. */
export function wavFormat(wav: Uint8Array) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const text = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
  return {
    riff: text(0),
    wave: text(8),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bits: view.getUint16(34, true),
    dataBytes: view.getUint32(40, true),
    size: wav.byteLength,
  };
}

export function voiceAnswersKept(): Cypress.Chainable<number> {
  return cy.window().then(
    (win) =>
      new Cypress.Promise<number>((resolve, reject) => {
        const open = win.indexedDB.open("graspy-db");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const count = db
            .transaction("voice-answers", "readonly")
            .objectStore("voice-answers")
            .count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
  );
}
