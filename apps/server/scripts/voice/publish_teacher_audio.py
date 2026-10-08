"""Record the teacher's English lines in YarnGPT's Idera and keep them in the audio store.

The Worker serves what is kept and speaks anything else with Spitch (src/app/voice/speech/teacher_audio.py),
so this is only ever a way to warm the store: a line not yet recorded is still spoken. YarnGPT answers in
3 to 11 seconds and queues about a second per request at once, which is why the Worker never asks it.

    uv run python scripts/voice/publish_teacher_audio.py staging --dry-run
    uv run python scripts/voice/publish_teacher_audio.py staging --limit 12
    uv run python scripts/voice/publish_teacher_audio.py staging --route job
    uv run python scripts/voice/publish_teacher_audio.py staging
    uv run python scripts/voice/publish_teacher_audio.py production --confirm production

Plan lines, the ones lessons use, are recorded first. YarnGPT allows 120 requests in 24 hours on the stream route
(the default, which answers in about 3 to 11 seconds); when that is spent the run stops and says when a place
frees, and --route job, which has its own allowance and answers more slowly, can go on meanwhile.

The key is YARNGPT_API_KEY in the environment or in --key-file (default apps/server/.dev.vars, which git
ignores). Recordings are written with `wrangler r2 object put`, so `npx wrangler login` must have been run. What
is kept is noted in ~/.cache/graspy/teacher-audio/<environment>.json beside a local copy of each recording,
so a run that stops can be run again and goes on from where it was.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import cache
from pathlib import Path

SERVER = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER / "src"))

from app.voice.curriculum import load_plans
from app.voice.speech.teacher_audio_contract import (
    audio_cache_key,
    published_utterance_ids,
    teacher_utterance,
    yarngpt_route,
)

BUCKETS = {"staging": "graspy-audio-staging", "production": "graspy-audio"}
API = "https://yarngpt.ai"
HOME = Path.home() / ".cache" / "graspy" / "teacher-audio"
USER_AGENT = "graspy-publisher/1"
MOST_ATTEMPTS = 3
BACKOFF_SECONDS = (2, 6, 18)
RATE_LIMITED_WAIT_SECONDS = 20
MOST_WAIT_SECONDS = 300
JOB_POLLS = 150
LEAST_BYTES = 1024
CREDITS_PER_THOUSAND_CHARACTERS = 1


class Stop(Exception):
    """The run cannot go on: the credits are spent or the key is refused."""


class Failed(Exception):
    """One line could not be recorded."""


def credits_said(error: urllib.error.HTTPError) -> str:
    """What the 402 says: the credits left and the credits the line needs, when the body gives them."""
    try:
        details = json.loads(error.read()).get("error", {}).get("details", {})
        return f"insufficient credits ({details['credits_remaining']} left, {details['credits_required']} needed)."
    except ValueError, KeyError, AttributeError, TypeError:
        return "no credits, or the account is not in good standing."


def parsed(data: bytes, *names: str) -> dict:
    """The JSON object the provider answered, with the fields wanted; anything else is a failed attempt, to be asked for again."""
    try:
        found = json.loads(data)
        for name in names:
            if not found.get(name):
                raise KeyError(name)
        return found
    except (ValueError, KeyError, AttributeError, TypeError) as error:
        raise Failed(f"an answer without {', '.join(names)}", 0) from error


def read_key(key_file: Path) -> str:
    key = os.environ.get("YARNGPT_API_KEY", "")
    if not key and key_file.exists():
        lines = key_file.read_text(encoding="utf-8").splitlines()
        key = next(
            (
                line.split("=", 1)[1]
                for line in lines
                if line.startswith("YARNGPT_API_KEY=")
            ),
            "",
        )
    key = key.strip().strip('"')
    if not key:
        raise SystemExit(f"No YARNGPT_API_KEY in the environment or in {key_file}.")
    return key


def is_mp3(audio: bytes) -> bool:
    """An MP3 with an ID3 tag or a frame header, and long enough to hold speech: an error page is neither."""
    return len(audio) >= LEAST_BYTES and (
        audio[:3] == b"ID3" or (audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0)
    )


class Yarn:
    """A recording by one of two routes: `stream` (`prepare` returns a ticket, and the ticket's URL serves the audio)
    or `job` (a job is queued, polled until done, and its signed link fetched)."""

    def __init__(
        self,
        key: str,
        route: str = "stream",
        opener=urllib.request.urlopen,
        sleep=time.sleep,
    ):
        self.key, self.route, self.opener, self.sleep = key, route, opener, sleep

    def _call(
        self, request: urllib.request.Request, timeout: int, signed: bool = False
    ) -> bytes:
        try:
            with self.opener(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            raise self._refusal(error, signed) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise Failed(f"{type(error).__name__}", 0) from error

    def _refusal(self, error: urllib.error.HTTPError, signed: bool) -> Exception:
        """Stop for what no retry mends (credits, the key, a spent allowance); Failed for the rest, an expired link included."""
        if error.code == 402:
            return Stop("YarnGPT refuses: " + credits_said(error))
        if error.code in (401, 403) and not signed:
            return Stop(f"YarnGPT refused the key (HTTP {error.code}).")
        retry = error.headers.get("Retry-After") if error.headers else None
        wait = int(retry) if retry and retry.isdigit() else RATE_LIMITED_WAIT_SECONDS
        if error.code == 429 and wait > MOST_WAIT_SECONDS:
            then = (
                "Run again then."
                if self.route == "job"
                else "Run again then, or with --route job."
            )
            return Stop(
                f"YarnGPT's allowance for this route is spent; a place frees in {wait // 60} minutes. {then}"
            )
        return Failed(f"HTTP {error.code}", wait if error.code == 429 else 0)

    def _headers(self, idempotency_key: str | None = None) -> dict:
        headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        }
        return (
            {**headers, "Idempotency-Key": idempotency_key}
            if idempotency_key
            else headers
        )

    def _post(self, path: str, body: dict, idempotency_key: str, *names: str) -> dict:
        request = urllib.request.Request(
            API + path,
            json.dumps(body).encode(),
            self._headers(idempotency_key),
            "POST",
        )
        return parsed(self._call(request, 60), *names)

    def _download(self, url: str) -> bytes:
        # A signed link: the key must not go with it, or the store refuses the request.
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        audio = self._call(request, 120, signed=True)
        if not is_mp3(audio):
            raise Failed("the answer was not an MP3", 0)
        return audio

    def _stream(self, text: str, voice: str, idempotency_key: str) -> bytes:
        ticket = self._post(
            "/api/v1/tts/prepare",
            {"text": text, "voice": voice},
            idempotency_key,
            "stream_url",
        )
        return self._download(API + ticket["stream_url"])

    def _job(self, text: str, voice: str, idempotency_key: str) -> bytes:
        job = self._post(
            "/api/v1/tts",
            {"text": text, "voice": voice, "output_format": "mp3"},
            idempotency_key,
            "job_id",
        )
        status = urllib.request.Request(
            f"{API}/api/v1/status/{job['job_id']}", headers=self._headers()
        )
        for _ in range(JOB_POLLS):
            state = parsed(self._call(status, 30), "status")
            if state["status"] == "completed":
                return self._download(
                    parsed(json.dumps(state).encode(), "audio_url")["audio_url"]
                )
            if state["status"] == "failed":
                raise Failed(state.get("user_message") or "the job failed", 0)
            self.sleep(1)
        raise Failed("the job did not finish in time", 0)

    def _once(self, text: str, voice: str, idempotency_key: str) -> bytes:
        return (self._job if self.route == "job" else self._stream)(
            text, voice, idempotency_key
        )

    def record(self, text: str, voice: str) -> bytes:
        # One key for the line, so a retry after an accepted request that timed out is not billed again.
        idempotency_key = str(uuid.uuid4())
        for attempt in range(MOST_ATTEMPTS):
            try:
                return self._once(text, voice, idempotency_key)
            except Failed as error:
                reason, wait = error.args
                if attempt == MOST_ATTEMPTS - 1:
                    raise Failed(reason) from error
                self.sleep(wait or BACKOFF_SECONDS[attempt])
        raise AssertionError("unreachable")


def keep(bucket: str, key: str, audio: bytes, run=None) -> None:
    run = run or subprocess.run
    with tempfile.NamedTemporaryFile(suffix=".mp3") as file:
        file.write(audio)
        file.flush()
        run(
            [
                "npx",
                "wrangler",
                "r2",
                "object",
                "put",
                f"{bucket}/{key}",
                "--file",
                file.name,
                "--content-type",
                "audio/mpeg",
                "--remote",
            ],
            cwd=SERVER,
            check=True,
            capture_output=True,
        )


@cache
def lessons_say() -> frozenset[str]:
    """The lines the lesson plans have the teacher say: what learners hear first."""
    return {
        event.utterance_id(plan.id)
        for plan in load_plans().values()
        for event in plan.events
    }


def lines_to_record(
    language: str, only: list[str], limit: int | None
) -> list[tuple[str, str, str]]:
    """(utterance id, store key, words) for each published line, in publication order."""
    found = []
    for utterance_id in sorted(
        published_utterance_ids(), key=lambda one: one not in lessons_say()
    ):
        if only and utterance_id not in only:
            continue
        utterance = teacher_utterance(utterance_id, language)
        found.append(
            (
                utterance_id,
                audio_cache_key(utterance_id, language, yarngpt_route(utterance)),
                utterance.text,
            )
        )
    return found[:limit]


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(
            f"{path} is damaged and is ignored: lines are recorded again.",
            file=sys.stderr,
        )
        return {}


def save(path: Path, state: dict) -> None:
    """Written whole and moved into place, so a run killed while writing leaves the earlier notes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(state, indent=1), encoding="utf-8")
    os.replace(temporary, path)


def publish(
    environment: str,
    language: str,
    only: list[str],
    limit: int | None,
    force: bool,
    workers: int,
    yarn: Yarn,
    store=None,
) -> dict:
    store = store or keep
    state_path = HOME / f"{environment}.json"
    state, copies = load(state_path), HOME / environment
    copies.mkdir(parents=True, exist_ok=True)
    todo = [
        line
        for line in lines_to_record(language, only, limit)
        if force or line[1] not in state
    ]
    outcome = {
        "made": 0,
        "skipped": len(lines_to_record(language, only, limit)) - len(todo),
        "failed": {},
    }

    lock, stopped = threading.Lock(), threading.Event()

    def one(line: tuple[str, str, str]) -> None:
        utterance_id, key, text = line
        started = time.time()
        audio = yarn.record(
            text,
            yarngpt_route(teacher_utterance(utterance_id, language)).request["voice"],
        )
        (copies / f"{language}-{utterance_id}.mp3").write_bytes(audio)
        store(BUCKETS[environment], key, audio)
        with lock:
            state[key] = {"bytes": len(audio), "id": utterance_id}
            outcome["made"] += 1
            save(state_path, state)
        print(
            f"{utterance_id}: {len(audio)} bytes in {time.time() - started:.1f} s",
            flush=True,
        )

    def fail(utterance_id: str, reason: str) -> None:
        with lock:
            outcome["failed"][utterance_id] = reason
        print(f"{utterance_id}: FAILED ({reason})", flush=True)

    def guarded(line: tuple[str, str, str]) -> None:
        if stopped.is_set():
            return
        try:
            one(line)
        except Stop as error:
            outcome["stopped"] = str(error)
            stopped.set()
        except Failed as error:
            fail(line[0], str(error))
        except subprocess.CalledProcessError as error:
            fail(
                line[0],
                "the store refused it: "
                + (error.stderr or b"").decode("utf-8", "replace")[-200:],
            )
        except Exception as error:  # noqa: BLE001 - one line's trouble is reported, and the run goes on
            fail(line[0], f"{type(error).__name__}: {error}")

    pool = ThreadPoolExecutor(workers)
    try:
        list(pool.map(guarded, todo))
    except BaseException:
        pool.shutdown(wait=False, cancel_futures=True)
        raise
    finally:
        pool.shutdown(wait=True)
        with lock:
            save(state_path, state)
    if "stopped" in outcome:
        raise Stop(outcome["stopped"], outcome)
    return outcome


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("environment", choices=sorted(BUCKETS))
    parser.add_argument("--language", default="en", choices=["en"])
    parser.add_argument("--only", nargs="*", default=[], help="utterance ids")
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--force", action="store_true", help="record again lines already kept"
    )
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--route", choices=["stream", "job"], default="stream")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm", default="")
    parser.add_argument("--key-file", type=Path, default=SERVER / ".dev.vars")
    args = parser.parse_args(argv)
    if (
        args.environment == "production"
        and args.confirm != "production"
        and not args.dry_run
    ):
        raise SystemExit(
            "Production changes what every learner hears: pass --confirm production."
        )
    lines = lines_to_record(args.language, args.only, args.limit)
    state = load(HOME / f"{args.environment}.json")
    todo = [line for line in lines if args.force or line[1] not in state]
    characters = sum(len(text) for _, _, text in todo)
    print(
        f"{len(lines)} lines, {len(todo)} to record ({characters} characters, about {characters * CREDITS_PER_THOUSAND_CHARACTERS / 1000:.0f} credits) into {BUCKETS[args.environment]}"
    )
    if args.dry_run:
        return 0
    try:
        outcome = publish(
            args.environment,
            args.language,
            args.only,
            args.limit,
            args.force,
            args.workers,
            Yarn(read_key(args.key_file), args.route),
        )
    except Stop as error:
        print(f"STOPPED: {error.args[0]}")
        if len(error.args) > 1:
            print(
                f"made {error.args[1]['made']} before it, failed {len(error.args[1]['failed'])}; the notes are saved."
            )
        return 2
    print(
        f"made {outcome['made']}, already kept {outcome['skipped']}, failed {len(outcome['failed'])}"
    )
    for utterance_id, reason in outcome["failed"].items():
        print(f"  {utterance_id}: {reason}")
    return 1 if outcome["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
