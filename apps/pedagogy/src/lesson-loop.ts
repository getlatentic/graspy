import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { decideWhatToSay, type Exchange } from "./child-model.ts";
import type { ChildVoice } from "./child-voice.ts";
import { sayIntoMicrophone } from "./microphone.ts";
import type { LessonObserver } from "./observer.ts";
import type { Persona } from "./personas.ts";
import type { PageStrings } from "./strings.ts";
import type { ChildTurn, Marking, Run, TeacherMove, Turn } from "./turn-log.ts";

const STALL_MS = 90_000;
const MARKING_MS = 60_000;
const QUIET_TAKE_MS = 12_000;
const STAYS_SILENT: ChildTurn = { said: null, isRight: null, note: "Too shy to say anything." };

export interface Sitting {
  page: Page;
  observer: LessonObserver;
  persona: Persona;
  learnerClass: string;
  strings: PageStrings;
  voice: ChildVoice;
  key: string;
  shotsDir: string;
  runDir: string;
  maxAnswers: number;
}

type Screen = "record" | "kept" | "rest" | "failed" | "waiting";

interface Answered {
  child: ChildTurn;
  audio: string | null;
  replyWaitMs: number | null;
  marking: Marking | null;
  pageNote: string | null;
  shots: string[];
  recordedAt: number;
}

async function screenOf(page: Page, strings: PageStrings): Promise<Screen> {
  if (await page.getByText(strings.rest).isVisible()) return "rest";
  if (await page.getByText(strings.loadFailed).isVisible()) return "failed";
  if (await page.getByRole("button", { name: strings.record }).isVisible()) return "record";
  if (await keptLine(page, strings)) return "kept";
  return "waiting";
}

async function keptLine(page: Page, strings: PageStrings): Promise<string | null> {
  const text = await page.locator("body").innerText();
  return strings.kept.find((line) => text.includes(line)) ?? null;
}

async function pageNote(page: Page, strings: PageStrings): Promise<string | null> {
  const text = await page.locator("body").innerText();
  return strings.problems.find((line) => text.includes(line)) ?? null;
}

async function shot(sitting: Sitting, name: string): Promise<string> {
  const file = `${name}.png`;
  await sitting.page.screenshot({ path: join(sitting.shotsDir, file) });
  return `shots/${file}`;
}

function exchangesOf(turns: Turn[]): Exchange[] {
  return turns
    .filter((turn) => turn.child)
    .map((turn) => ({
      teacherSaid: turn.move.says,
      childSaid: turn.child?.said ?? null,
      teacherReplied: turn.marking?.feedback ?? turn.pageNote,
    }));
}

async function openTake(sitting: Sitting): Promise<void> {
  const { page, strings } = sitting;
  await page.getByRole("button", { name: strings.record }).click();
  await page.getByText(strings.speakNow).waitFor();
}

/** The child's recording is kept with the run, so what was played to the app can be heard again. */
function keepRecording(runDir: string, index: number, wav: Buffer): string {
  mkdirSync(join(runDir, "answers"), { recursive: true });
  const file = `answers/${String(index).padStart(2, "0")}.wav`;
  writeFileSync(join(runDir, file), wav);
  return file;
}

/** The child answers what the teacher asked, and the page's reply is waited for and kept. */
async function answer(sitting: Sitting, turn: Turn, turns: Turn[]): Promise<Answered> {
  const { page, observer, persona } = sitting;
  const { move, index } = turn;
  const shots = [await shot(sitting, `${String(index).padStart(2, "0")}-question`)];
  const child = persona.silent ? STAYS_SILENT : await decideWhatToSay(sitting.key, persona, {
    teacherSays: move.says,
    teacherShows: move.shows,
    learnerClass: sitting.learnerClass,
    history: exchangesOf(turns),
  });
  const before = observer.markings.length;
  const wav = child.said ? await sitting.voice.speak(child.said, persona.pitch, index) : null;
  const audio = wav ? keepRecording(sitting.runDir, index, wav) : null;
  const recordedAt = Date.now();
  await openTake(sitting);
  if (wav) {
    await page.waitForTimeout(persona.reactionMs);
    await sayIntoMicrophone(page, wav);
  }
  const spoke = Date.now();
  const outcome = await settle(sitting, before);
  // A child who says nothing waits out the app's own listening window: that is not a slow reply.
  const replyWaitMs = wav ? Date.now() - spoke : null;
  shots.push(await shot(sitting, `${String(index).padStart(2, "0")}-result`));
  return { child, audio, shots, replyWaitMs, recordedAt, ...outcome };
}

/** Waits for the answer to be marked, or for the page to say why it was not. */
async function settle(sitting: Sitting, before: number): Promise<Pick<Answered, "marking" | "pageNote">> {
  const { page, observer, strings } = sitting;
  const deadline = Date.now() + Math.max(MARKING_MS, QUIET_TAKE_MS);
  while (Date.now() < deadline) {
    if (observer.markings.length > before) return { marking: observer.markings[before], pageNote: null };
    const kept = await keptLine(page, strings);
    if (kept) return { marking: null, pageNote: kept };
    const note = await pageNote(page, strings);
    if (note && (await page.getByRole("button", { name: strings.record }).isVisible())) return { marking: null, pageNote: note };
    await page.waitForTimeout(250);
  }
  return { marking: null, pageNote: await pageNote(page, strings) };
}

/** A turn for each move the server has offered since the last look. */
function syncMoves(turns: Turn[], moves: TeacherMove[], counted: { moves: number }): void {
  for (; counted.moves < moves.length; counted.moves++) {
    turns.push({ index: turns.length + 1, move: moves[counted.moves], child: null, answerAudio: null, marking: null, replyWaitMs: null, pageNote: null, screenshots: [] });
  }
}

/** The turn the child answers now: a question asked again after an answer is a turn of its own. */
function turnToAnswer(turns: Turn[]): Turn {
  const latest = turns[turns.length - 1];
  if (!latest.child) return latest;
  const again: Turn = { ...latest, move: { ...latest.move, offeredAt: undefined }, index: turns.length + 1, child: null, answerAudio: null, marking: null, replyWaitMs: null, pageNote: null, screenshots: [] };
  turns.push(again);
  return again;
}

export async function playLesson(sitting: Sitting): Promise<{ turns: Turn[]; finished: Run["finished"] }> {
  const { page, observer, strings } = sitting;
  const turns: Turn[] = [];
  const counted = { moves: 0 };
  let answered = 0;
  let lastChange = Date.now();
  while (answered < sitting.maxAnswers) {
    const before = counted.moves;
    syncMoves(turns, observer.moves, counted);
    if (counted.moves !== before) lastChange = Date.now();
    const screen = await screenOf(page, strings);
    if (screen === "rest") return { turns, finished: "rest" };
    if (screen === "record" && turns.length > 0) {
      const turn = turnToAnswer(turns);
      const given = await answer(sitting, turn, turns);
      Object.assign(turn, { child: given.child, answerAudio: given.audio, marking: given.marking, replyWaitMs: given.replyWaitMs, pageNote: given.pageNote, screenshots: given.shots, recordedAt: given.recordedAt });
      answered++;
      lastChange = Date.now();
    }
    if (screen === "kept") await page.getByRole("button", { name: strings.continue }).click();
    if (screen === "failed" || Date.now() - lastChange > STALL_MS) return { turns, finished: "stalled" };
    await page.waitForTimeout(300);
  }
  return { turns, finished: "turn-limit" };
}
