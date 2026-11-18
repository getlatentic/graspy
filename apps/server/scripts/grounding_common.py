"""What the grounding study scripts share: the one kind of model they may run, and files written whole or not at all."""

from __future__ import annotations

import json
from pathlib import Path

import dspy

from app.llm.client import build_lm, resolve_model
from app.settings import Settings

# Nothing graspy runs, a judge included, may be a Claude model (owner's rule).
FORBIDDEN_IN_MODEL = ("claude", "anthropic")
ERROR_CHARS = 300


def study_lm(settings: Settings) -> tuple[dspy.LM, dict]:
    """The model of .env without a cache, and the facts of it that go into every output file."""
    model = resolve_model(settings)
    if any(word in model.lower() for word in FORBIDDEN_IN_MODEL):
        raise SystemExit(f"{model} is a Claude model; the study may not run one")
    lm = build_lm(settings).copy(cache=False)
    if any(word in lm.model.lower() for word in FORBIDDEN_IN_MODEL):
        raise SystemExit(f"{lm.model} is a Claude model; the study may not run one")
    meta = {
        "model": lm.model,
        "temperature": lm.kwargs.get("temperature"),
        "reasoning_effort": lm.kwargs.get("reasoning_effort"),
    }
    return lm, meta


def error_text(error: Exception) -> str:
    return f"{type(error).__name__}: {error}"[:ERROR_CHARS]


def save_json(path: Path, data: object) -> None:
    """A crash part-way leaves the last complete file, not half of one."""
    partial = path.with_name(path.name + ".partial")
    partial.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    partial.replace(path)
