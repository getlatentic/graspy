import { existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { installAudioProbe, readAudioLog } from "./audio-probe.ts";
import { openChild } from "./browser.ts";
import { checkRun } from "./checks.ts";
import { ChildVoice, ENGINE_NAME, locateYarngo, type Speaker } from "./child-voice.ts";
import { judgedOrNull, type Judgement } from "./judge.ts";
import { LessonObserver } from "./observer.ts";
import { openLesson } from "./open-lesson.ts";
import { onboard, type Learner } from "./onboarding.ts";
import { personaNamed } from "./personas.ts";
import { SAY_ENGINE_NAME, SayVoice } from "./say-voice.ts";
import { transcriptMarkdown, writeRun } from "./report.ts";
import { playLesson } from "./lesson-loop.ts";
import { bedrockKey } from "./secrets.ts";
import { pageStrings } from "./strings.ts";
import type { Run } from "./turn-log.ts";

const USAGE = `Usage: npm run pedagogy -w @graspy/pedagogy -- [options]
  --persona <id>     sure | unsure | stuck | silent | offtopic | needy | unwell | pidgin   (default sure)
  --class <id>       the learner's class, such as primary_4 or nursery_1 (default primary_4)
  --language <id>    the lesson language: en | yo | pcm                  (default the persona's)
  --lesson <title>   the lesson's title as Voice lessons lists it        (default the one marked Start here)
  --answers <n>      stop after this many answers                        (default 10)
  --web <url>        the web app                                         (default http://localhost:5173)
  --out <dir>        where runs are kept                                 (default runs)
  --say-voice <name> speak with this macOS system voice (Samantha, Aman) where the cloned voice's model is not installed
  --reuse-device     keep one child's device between runs (skips onboarding, but the lesson resumes)
  --no-judge         skip the model that reads the transcript`;

function options() {
  const { values } = parseArgs({
    options: {
      persona: { type: "string", default: "sure" },
      class: { type: "string", default: "primary_4" },
      language: { type: "string" },
      lesson: { type: "string" },
      answers: { type: "string", default: "10" },
      web: { type: "string", default: "http://localhost:5173" },
      out: { type: "string", default: "runs" },
      "say-voice": { type: "string" },
      "reuse-device": { type: "boolean", default: false },
      "no-judge": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  return values;
}

async function main(): Promise<void> {
  const args = options();
  if (args.help) return void console.log(USAGE);
  const persona = personaNamed(args.persona as string);
  const language = (args.language ?? persona.spoken) as Learner["language"];
  const learnerClass = args.class as string;
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${persona.id}-${learnerClass}-${language}`;
  const out = resolve(args.out as string);
  const dir = join(out, runId);
  mkdirSync(join(dir, "shots"), { recursive: true });
  mkdirSync(join(out, ".state"), { recursive: true });

  const state = args["reuse-device"] ? join(out, ".state", `${learnerClass}-${language}.json`) : join(dir, "device.json");
  const { browser, context } = await openChild(state);
  const sayVoice = args["say-voice"];
  const voice: Speaker = sayVoice ? new SayVoice(sayVoice, join(out, ".voice-cache")) : new ChildVoice(locateYarngo(), join(out, ".voice-cache"));
  const engine = sayVoice ? SAY_ENGINE_NAME : ENGINE_NAME;
  try {
    const page = await context.newPage();
    const web = args.web as string;
    if (!existsSync(state)) {
      await onboard(page, web, { learnerClass, language });
      if (args["reuse-device"]) await context.storageState({ path: state, indexedDB: true });
    }
    const strings = pageStrings(language);
    await installAudioProbe(page);
    const observer = new LessonObserver(page, language);
    await openLesson(page, web, strings, args.lesson ?? null);
    const startedAt = new Date().toISOString();
    const { turns, finished } = await playLesson({
      page, observer, persona, learnerClass, strings, voice, key: bedrockKey(), shotsDir: join(dir, "shots"), runDir: dir,
      maxAnswers: persona.id === "silent" ? 3 : Number(args.answers),
    });
    const run: Run = { id: runId, voice: { engine, reference: basename(voice.reference, ".wav"), pitch: persona.pitch }, persona: persona.id, language, learnerClass, plan: turns[0]?.move.planId ?? null, startedAt, site: web, finished, turns, audio: await readAudioLog(page) };
    const findings = checkRun(run);
    const judgement: Judgement | null = args["no-judge"] ? null : await judgedOrNull(bedrockKey(), transcriptMarkdown(run, findings, null));
    writeRun(dir, run, findings, judgement);
    console.log(`${dir}/transcript.md`);
    console.log(`${dir}/script.md`);
  } finally {
    voice.close();
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
