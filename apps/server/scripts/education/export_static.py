"""Write each country's school systems as a static file the web app serves itself.

    uv run python scripts/education/export_static.py

The classes a learner chooses from are the same for everyone, so the app reads them from its own host, where a
request never waits for the API to wake up. The API still serves them, and the app asks it when a file is missing.
tests/test_education_static.py fails when the files are not what this writes.
"""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import TypeAdapter

from app.education.catalogue import SystemView, of_country, view

ROOT = Path(__file__).resolve().parents[4]
COUNTRIES_TS = ROOT / "apps" / "web" / "src" / "lib" / "country-languages.ts"
OUT = ROOT / "apps" / "web" / "public" / "education" / "countries"
_VIEWS = TypeAdapter(list[SystemView])


def country_codes() -> list[str]:
    """The countries the app lets a learner choose, as its own list names them."""
    source = COUNTRIES_TS.read_text()
    return sorted(set(re.findall(r'^\s*"?([A-Z]{2})"?:\s*\[', source, re.MULTILINE)))


def render(country: str) -> str:
    """What the API answers for the country, as the file the app reads."""
    return (
        _VIEWS.dump_json(
            [view(system) for system in of_country(country)], by_alias=True
        ).decode()
        + "\n"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    codes = country_codes()
    for code in codes:
        (OUT / f"{code}.json").write_text(render(code))
    for stale in OUT.glob("*.json"):
        if stale.stem not in codes:
            stale.unlink()
    print(f"wrote {len(codes)} files to {OUT}")


if __name__ == "__main__":
    main()
