"""Record the teacher's English lines in YarnGPT's Idera and keep them in the audio store.

The Worker serves what is kept and speaks anything else with Spitch (src/app/voice/speech/teacher_audio.py),
so this is only ever a way to warm the store: a line not yet recorded is still spoken. YarnGPT answers in
3 to 11 seconds and queues about a second per request at once, which is why the Worker never asks it.

    uv run python scripts/voice/publish_teacher_audio.py staging --dry-run
    uv run python scripts/voice/publish_teacher_audio.py staging --limit 12
    uv run python scripts/voice/publish_teacher_audio.py staging
    uv run python scripts/voice/publish_teacher_audio.py production --confirm production

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
from pathlib import Path

SERVER = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER / "src"))

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
LEAST_BYTES = 1024
CREDITS_PER_THOUSAND_CHARACTERS = 1


class Stop(Exception):
    """The run cannot go on: the credits are spent or the key is refused."""


class Failed(Exception):
    """One line could not be recorded."""


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
    """The two requests that make a recording: `prepare` returns a ticket, and the ticket's URL serves the audio."""

    def __init__(self, key: str, opener=urllib.request.urlopen, sleep=time.sleep):
        self.key, self.opener, self.sleep = key, opener, sleep

    def _call(self, request: urllib.request.Request, timeout: int) -> bytes:
        try:
            with self.opener(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 402:
                raise Stop(
                    "YarnGPT refuses: no credits, or the account is not in good standing."
                ) from error
            if error.code in (401, 403):
                raise Stop(f"YarnGPT refused the key (HTTP {error.code}).") from error
            retry = error.headers.get("Retry-After") if error.headers else None
            wait = (
                int(retry) if retry and retry.isdigit() else RATE_LIMITED_WAIT_SECONDS
            )
            raise Failed(
                f"HTTP {error.code}", wait if error.code == 429 else 0
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise Failed(f"{type(error).__name__}", 0) from error

    def _once(self, text: str, voice: str) -> bytes:
        body = json.dumps({"text": text, "voice": voice}).encode()
        headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4()),
            "User-Agent": USER_AGENT,
        }
        ticket = json.loads(
            self._call(
                urllib.request.Request(
                    f"{API}/api/v1/tts/prepare", body, headers, "POST"
                ),
                60,
            )
        )
        stream = urllib.request.Request(
            API + ticket["stream_url"], headers={"User-Agent": USER_AGENT}
        )
        audio = self._call(stream, 120)
        if not is_mp3(audio):
            raise Failed("the answer was not an MP3", 0)
        return audio

    def record(self, text: str, voice: str) -> bytes:
        for attempt in range(MOST_ATTEMPTS):
            try:
                return self._once(text, voice)
            except Failed as error:
                reason, wait = error.args
                if attempt == MOST_ATTEMPTS - 1:
                    raise Failed(reason) from error
                self.sleep(wait or BACKOFF_SECONDS[attempt])
        raise AssertionError("unreachable")


def keep(bucket: str, key: str, audio: bytes, run=subprocess.run) -> None:
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


def lines_to_record(
    language: str, only: list[str], limit: int | None
) -> list[tuple[str, str, str]]:
    """(utterance id, store key, words) for each published line, in publication order."""
    found = []
    for utterance_id in published_utterance_ids():
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
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def publish(
    environment: str,
    language: str,
    only: list[str],
    limit: int | None,
    force: bool,
    workers: int,
    yarn: Yarn,
    store=keep,
) -> dict:
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

    lock = threading.Lock()

    def one(line: tuple[str, str, str]) -> None:
        utterance_id, key, text = line
        started = time.time()
        audio = yarn.record(
            text,
            yarngpt_route(teacher_utterance(utterance_id, language)).request["voice"],
        )
        store(BUCKETS[environment], key, audio)
        (copies / f"{language}-{utterance_id}.mp3").write_bytes(audio)
        with lock:
            state[key] = {"bytes": len(audio), "id": utterance_id}
            outcome["made"] += 1
        print(
            f"{utterance_id}: {len(audio)} bytes in {time.time() - started:.1f} s",
            flush=True,
        )

    def guarded(line: tuple[str, str, str]) -> None:
        try:
            one(line)
        except Failed as error:
            with lock:
                outcome["failed"][line[0]] = str(error)
            print(f"{line[0]}: FAILED ({error})", flush=True)
        except subprocess.CalledProcessError as error:
            outcome["failed"][line[0]] = (
                "the store refused it: "
                + error.stderr.decode("utf-8", "replace")[-200:]
            )
            print(f"{line[0]}: store refused it", flush=True)

    try:
        with ThreadPoolExecutor(workers) as pool:
            list(pool.map(guarded, todo))
    finally:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=1), encoding="utf-8")
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
            Yarn(read_key(args.key_file)),
        )
    except Stop as error:
        print(f"STOPPED: {error}")
        return 2
    print(
        f"made {outcome['made']}, already kept {outcome['skipped']}, failed {len(outcome['failed'])}"
    )
    for utterance_id, reason in outcome["failed"].items():
        print(f"  {utterance_id}: {reason}")
    return 1 if outcome["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
