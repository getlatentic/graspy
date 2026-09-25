"""Server and client slugs, pinned to the corpus apps/web/src/lib/slug.test.ts
reads too."""

import json
from pathlib import Path

from hypothesis import given
from hypothesis import strategies as st

from app.utils.slug import slugify


def _find_corpus() -> Path:
    """Walk up rather than count directories: this file is also run from a
    copied tree by the mutation tester, where the depth differs."""
    relative = Path("tests/fixtures/slug-corpus.json")
    for parent in Path(__file__).resolve().parents:
        candidate = parent / relative
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"{relative} not found above {__file__}")


CORPUS = json.loads(_find_corpus().read_text(encoding="utf-8"))


def test_matches_shared_corpus():
    """One test over the whole table: every mismatch is reported together, so
    a change of rule shows its full blast radius rather than the first case."""
    mismatches = {
        case["input"]: (slugify(case["input"]), case["expected"])
        for case in CORPUS
        if slugify(case["input"]) != case["expected"]
    }

    assert not mismatches, (
        f"{len(mismatches)} of {len(CORPUS)} inputs disagree with the corpus "
        f"shared with apps/web/src/lib/slug.test.ts: {mismatches}"
    )


def test_names_in_any_script_keep_distinct_slugs():
    """A slug of a-z only would make every Arabic subject "subject", and a
    curriculum of seven would collapse into one."""
    names = ["اللغة العربية", "الرياضيات", "العلوم", "Математика", "数学"]
    assert len({slugify(name) for name in names}) == len(names)


@given(st.text())
def test_output_is_always_a_usable_slug(value):
    slug = slugify(value)
    assert slug
    assert slug.strip("-") == slug
    # Letters of every script, many of which have no case, already lowercase.
    assert all(c.isalnum() or c == "-" for c in slug)
    assert slug == slug.lower() or slug == "subject"
    assert "--" not in slug


@given(st.text())
def test_slugify_is_idempotent(value):
    once = slugify(value)
    assert slugify(once) == once
