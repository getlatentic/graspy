"""Check school-system files as the catalogue does before serving them.

    uv run python scripts/education/check_systems.py            # every file
    uv run python scripts/education/check_systems.py NG GB-SCT  # these

Prints each file's problems and exits non-zero when any has one.
"""

from __future__ import annotations

import sys

from app.education.catalogue import SYSTEMS, checked


def check(system_id: str) -> list[str]:
    path = SYSTEMS / f"{system_id}.json"
    if not path.exists():
        return [f"{path} does not exist"]
    return checked(path)[1]


def main(system_ids: list[str]) -> int:
    ids = system_ids or sorted(path.stem for path in SYSTEMS.glob("*.json"))
    failing = 0
    for system_id in ids:
        found = check(system_id)
        failing += bool(found)
        print(f"{system_id}: {'ok' if not found else ' | '.join(found)}")
    print(f"{len(ids) - failing} ok, {failing} with problems")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main([arg.upper() for arg in sys.argv[1:]]))
