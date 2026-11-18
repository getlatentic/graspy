"""What changed between two revisions of a curriculum package, by objective code.

Each side is a package file, or `REV:PATH` for the file at a git revision (PATH from the repository root):

    uv run python scripts/curriculum_revision_diff.py OLD NEW [--course mathematics-jss1]
    uv run python scripts/curriculum_revision_diff.py HEAD~3:apps/teacher/.../curriculum.graspy-curriculum path/to/new.graspy-curriculum

It reads and prints only; nothing the server runs depends on it. An objective is added or removed when its code is in
one revision only, reworded when the code stays and its statement changes, and moved when the code stays and it sits
under a different topic or subtopic. A reworded objective that also moved is listed under both.
"""

import argparse
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.domains.curriculum.packages.export import REPOSITORY, read_package

GIT_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class Objective:
    code: str
    statement: str
    topic: str
    subtopic: str


@dataclass(frozen=True)
class Revision:
    package_id: str
    number: int
    sha256: str
    courses: dict[str, dict[str, Objective]]


@dataclass(frozen=True)
class CourseDiff:
    added: list[Objective]
    removed: list[Objective]
    reworded: list[tuple[Objective, Objective]]
    moved: list[tuple[Objective, Objective]]

    def empty(self) -> bool:
        return not (self.added or self.removed or self.reworded or self.moved)


def _place(nodes: dict[str, dict], start: str) -> tuple[str, str]:
    """The topic and subtopic codes above the node an objective hangs from."""
    found: dict[str, str] = {}
    code: str | None = start
    for _ in range(len(nodes) + 1):
        if code is None:
            break
        node = nodes.get(code)
        if node is None:
            raise ValueError(f"node {code!r} is named but not in the package")
        found.setdefault(node["kind"], node["code"])
        code = node.get("parentCode")
    else:
        raise ValueError(f"node {start!r} has a parent cycle")
    return found.get("topic", ""), found.get("subtopic", "")


def _objectives(course: dict) -> dict[str, Objective]:
    nodes = {node["code"]: node for node in course["nodes"]}
    found: dict[str, Objective] = {}
    for item in course["objectives"]:
        if item["code"] in found:
            raise ValueError(f"{course['courseKey']}: objective {item['code']!r} twice")
        topic, subtopic = _place(nodes, item["nodeCode"])
        found[item["code"]] = Objective(
            item["code"], item["statement"], topic, subtopic
        )
    return found


def load(source: str) -> Revision:
    """A package from a file path, or from `REV:PATH` in git history."""
    if Path(source).is_file():
        payload, digest = read_package(Path(source))
    elif ":" in source and not source.startswith("-"):
        payload, digest = _from_git(source)
    else:
        raise FileNotFoundError(f"{source}: not a file, and not REV:PATH")
    courses = {c["courseKey"]: _objectives(c) for c in payload["courses"]}
    return Revision(
        payload["packageId"], payload.get("packageRevision", 1), digest, courses
    )


def _from_git(source: str) -> tuple[dict, str]:
    shown = subprocess.run(
        ["git", "show", source],
        cwd=REPOSITORY,
        capture_output=True,
        check=False,
        timeout=GIT_TIMEOUT_SECONDS,
    )
    if shown.returncode:
        raise ValueError(f"{source}: {shown.stderr.decode(errors='replace').strip()}")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "package"
        path.write_bytes(shown.stdout)
        return read_package(path)


def diff_course(old: dict[str, Objective], new: dict[str, Objective]) -> CourseDiff:
    kept = [code for code in new if code in old]
    return CourseDiff(
        added=[new[c] for c in new if c not in old],
        removed=[old[c] for c in old if c not in new],
        reworded=[
            (old[c], new[c]) for c in kept if old[c].statement != new[c].statement
        ],
        moved=[
            (old[c], new[c])
            for c in kept
            if (old[c].topic, old[c].subtopic) != (new[c].topic, new[c].subtopic)
        ],
    )


def diff(
    old: Revision, new: Revision, only: str | None = None
) -> dict[str, CourseDiff]:
    """The change in every course both revisions hold, or in `only`, which both must hold."""
    if old.package_id != new.package_id:
        raise ValueError(f"different packages: {old.package_id} and {new.package_id}")
    if only and not (only in old.courses and only in new.courses):
        raise ValueError(f"course not in both revisions: {only}")
    keys = [only] if only else sorted(set(old.courses) & set(new.courses))
    return {k: diff_course(old.courses[k], new.courses[k]) for k in keys}


def _where(objective: Objective) -> str:
    return f"{objective.topic} / {objective.subtopic}"


def render(
    old: Revision,
    new: Revision,
    changes: dict[str, CourseDiff],
    only: str | None = None,
) -> str:
    lines = [
        f"{new.package_id}: revision {old.number} ({old.sha256[:12]}) -> {new.number} ({new.sha256[:12]})"
    ]
    if only is None:
        lines += [
            f"\ncourse {k} is only in revision {old.number}"
            for k in sorted(old.courses.keys() - new.courses.keys())
        ]
        lines += [
            f"\ncourse {k} is only in revision {new.number}"
            for k in sorted(new.courses.keys() - old.courses.keys())
        ]
    for key, change in changes.items():
        lines.append(f"\ncourse {key}")
        if change.empty():
            lines.append("  no change")
            continue
        lines += [
            f"  added    {o.code}  [{_where(o)}]  {o.statement}" for o in change.added
        ]
        lines += [
            f"  removed  {o.code}  [{_where(o)}]  {o.statement}" for o in change.removed
        ]
        for before, after in change.reworded:
            lines.append(
                f"  reworded {after.code}\n    was: {before.statement}\n    now: {after.statement}"
            )
        for before, after in change.moved:
            lines.append(
                f"  moved    {after.code}  {_where(before)} -> {_where(after)}"
            )
        lines.append(
            f"  {len(change.added)} added, {len(change.removed)} removed, "
            f"{len(change.reworded)} reworded, {len(change.moved)} moved"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("old", help="package file, or REV:PATH")
    parser.add_argument("new", help="package file, or REV:PATH")
    parser.add_argument("--course", help="only this courseKey")
    args = parser.parse_args(argv)
    try:
        old, new = load(args.old), load(args.new)
        print(render(old, new, diff(old, new, args.course), args.course))
    except (
        ValueError,
        OSError,
        KeyError,
        json.JSONDecodeError,
        subprocess.SubprocessError,
    ) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
