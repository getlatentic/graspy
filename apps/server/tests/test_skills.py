"""The tutor's skills: the SKILL.md files, the registry and catalogue built from
them, the load_skill tool, and the Worker rule that ships them."""

import json
import re
from pathlib import Path

import pytest
from test_agent_tools import maths, use

from app.agent.skills.registry import SKILLS_DIR, catalogue, skills
from app.agent.skills.skill import MAX_BODY_WORDS, parse
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.agent.tutor import signature_for

SERVER = Path(__file__).parents[1]
FIRST_SKILLS = {"explaining-a-mistake", "worked-example", "checking-understanding"}


def folders() -> list[Path]:
    return sorted(
        path
        for path in SKILLS_DIR.iterdir()
        if path.is_dir() and path.name != "__pycache__"
    )


def written(tmp_path: Path, name: str, text: str) -> Path:
    folder = tmp_path / name
    folder.mkdir()
    (folder / "SKILL.md").write_text(text, encoding="utf-8")
    return folder / "SKILL.md"


def test_the_first_three_skills_are_shipped():
    assert FIRST_SKILLS <= set(skills())


@pytest.mark.parametrize("folder", folders(), ids=lambda path: path.name)
def test_every_skill_folder_holds_a_skill_named_as_the_folder(folder):
    assert (folder / "SKILL.md").is_file()
    assert parse(folder / "SKILL.md").name == folder.name


def test_every_skill_has_a_description_and_a_body_within_the_cap():
    assert skills()
    for skill in skills().values():
        assert skill.description.strip(), skill.name
        assert 0 < len(skill.body.split()) <= MAX_BODY_WORDS, skill.name


def test_the_registry_holds_exactly_the_folders():
    assert set(skills()) == {folder.name for folder in folders()}


def test_the_catalogue_lists_each_registered_skill_and_nothing_else():
    listed = re.findall(r"^- ([\w-]+): (.+)$", catalogue(), flags=re.MULTILINE)

    assert dict(listed) == {s.name: s.description for s in skills().values()}


def test_the_tutor_is_told_the_catalogue_for_every_kind_of_learner():
    for grade_level in ("Primary 2", "JSS 1", None):
        instructions = signature_for(
            maths().model_copy(update={"grade_level": grade_level})
        ).instructions

        assert instructions.endswith(catalogue())


def test_load_skill_gives_the_body_of_the_skill():
    result, outputs = use("load_skill", maths(), "worked-example")

    assert result == {
        "skill": "worked-example",
        "guidance": skills()["worked-example"].body,
    }
    assert outputs.actions == [] and outputs.cards == []


def test_load_skill_names_the_skills_when_the_name_is_unknown():
    result, _ = use("load_skill", maths(), "astrology")

    assert "guidance" not in result
    assert all(name in result["error"] for name in skills())


def test_the_tutor_has_the_load_skill_tool():
    names = [t.__name__ for t in tools_for(Turn(maths(), "hi"), TurnOutputs())]

    assert "load_skill" in names


@pytest.mark.parametrize(
    ("text", "complaint"),
    [
        ("# no frontmatter\n\nbody", "starts with"),
        ("---\nname: a\ndescription: d\n", "never closed"),
        ("---\nname: other\ndescription: d\n---\nbody", "is named 'other'"),
        ("---\nname: a\n---\nbody", "no description"),
        ("---\nname: a\ndescription: d\n---\n", "no body"),
        (f"---\nname: a\ndescription: d\n---\n{'word ' * 251}", "words"),
    ],
)
def test_a_skill_that_breaks_the_format_is_refused(tmp_path, text, complaint):
    with pytest.raises(ValueError, match=complaint):
        parse(written(tmp_path, "a", text))


def test_the_worker_uploads_every_skill_file():
    """The Worker reads SKILL.md beside its module, as it reads the school
    catalogue, but Markdown is only uploaded when a rule says so."""
    config = re.sub(
        r"^\s*//.*$", "", (SERVER / "wrangler.jsonc").read_text(), flags=re.MULTILINE
    )
    rules = json.loads(config)["rules"]
    covering = [
        rule
        for rule in rules
        if rule["type"] == "Text"
        and "app/agent/skills/**/SKILL.md" in rule["globs"]
        and rule.get("fallthrough") is True
    ]

    assert covering
    assert all(
        (SERVER / "src" / "app" / "agent" / "skills" / name / "SKILL.md").is_file()
        for name in skills()
    )
