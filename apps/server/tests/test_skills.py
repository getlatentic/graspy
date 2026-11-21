"""The tutor's skills: the SKILL.md files, the registry and catalogue built from
them, the load_skill tool, and the Worker rule that ships them."""

import json
import logging
import re
from pathlib import Path

import pytest
from test_agent_tools import maths

from app.agent.skills.load import MAX_NAME_ECHO
from app.agent.skills.registry import SKILLS_DIR, catalogue, read_all, skills
from app.agent.skills.skill import MAX_BODY_WORDS, MAX_DESCRIPTION_WORDS, parse
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.agent.tutor import signature_for

SERVER = Path(__file__).parents[1]
FIRST_SKILLS = {"explaining-a-mistake", "worked-example", "checking-understanding"}
GOOD = "---\nname: a\ndescription: Use it.\n---\nDo this."


def folders() -> list[Path]:
    return sorted(
        path
        for path in SKILLS_DIR.iterdir()
        if path.is_dir() and path.name != "__pycache__"
    )


def written(root: Path, name: str, text: str | bytes) -> Path:
    folder = root / name
    folder.mkdir()
    path = folder / "SKILL.md"
    if isinstance(text, bytes):
        path.write_bytes(text)
    else:
        path.write_text(text, encoding="utf-8")
    return path


def load_skill_of_a_turn():
    built = tools_for(Turn(maths(), "hi"), TurnOutputs())
    return next(tool for tool in built if tool.__name__ == "load_skill")


def test_the_first_three_skills_are_shipped():
    assert FIRST_SKILLS <= set(skills())


@pytest.mark.parametrize("folder", folders(), ids=lambda path: path.name)
def test_every_skill_folder_holds_a_skill_that_parses_strictly(folder):
    assert (folder / "SKILL.md").is_file()
    assert parse(folder / "SKILL.md").name == folder.name


def test_every_skill_has_a_description_and_a_body_within_the_caps():
    assert skills()
    for skill in skills().values():
        assert 0 < len(skill.description.split()) <= MAX_DESCRIPTION_WORDS, skill.name
        assert 0 < len(skill.body.split()) <= MAX_BODY_WORDS, skill.name


def test_the_registry_holds_exactly_the_folders():
    assert set(skills()) == {folder.name for folder in folders()}


def test_the_catalogue_lists_each_registered_skill_and_nothing_else():
    listed = re.findall(r"^- ([\w-]+): (.+)$", catalogue(), flags=re.MULTILINE)

    assert dict(listed) == {s.name: s.description for s in skills().values()}


def test_the_catalogue_says_skills_in_effect_are_shown_and_need_no_reload():
    assert "shown to you under skills in effect" in catalogue()
    assert "do not load it again" in catalogue()


@pytest.mark.parametrize("name", sorted(FIRST_SKILLS))
def test_a_skill_that_spans_turns_does_not_tell_the_tutor_to_reload_it(name):
    assert "load it again" not in skills()[name].body


def test_the_tutor_is_told_the_catalogue_for_every_kind_of_learner():
    for grade_level in ("Primary 2", "JSS 1", None):
        instructions = signature_for(
            maths().model_copy(update={"grade_level": grade_level})
        ).instructions

        assert instructions.endswith(catalogue())


def test_load_skill_gives_the_body_of_the_skill():
    assert load_skill_of_a_turn()("worked-example") == {
        "skill": "worked-example",
        "guidance": skills()["worked-example"].body,
    }


def test_a_skill_loaded_twice_in_a_turn_is_told_to_use_what_it_has():
    load = load_skill_of_a_turn()
    load("worked-example")

    again = load("worked-example")

    assert again == {
        "skill": "worked-example",
        "note": "Already in effect: use it.",
    }
    assert "guidance" in load("checking-understanding")


def test_what_a_turn_has_loaded_is_not_kept_for_the_next_turn():
    load_skill_of_a_turn()("worked-example")

    assert "guidance" in load_skill_of_a_turn()("worked-example")


def test_an_unknown_name_is_a_plain_error_that_lists_the_skills():
    result = load_skill_of_a_turn()("astrology")

    assert list(result) == ["error"]
    assert "Nothing was done" not in result["error"]
    assert all(name in result["error"] for name in skills())


def test_a_long_wrong_name_is_not_echoed_whole():
    result = load_skill_of_a_turn()("x" * 5000)

    assert "x" * (MAX_NAME_ECHO + 1) not in result["error"]
    assert len(result["error"]) < 500


def test_the_tutor_has_the_load_skill_tool():
    names = [t.__name__ for t in tools_for(Turn(maths(), "hi"), TurnOutputs())]

    assert "load_skill" in names


@pytest.mark.parametrize(
    ("text", "complaint"),
    [
        ("# no frontmatter\n\nbody", "no --- frontmatter"),
        ("---\nname: a\ndescription: d\n", "never closed"),
        ("---\nname: other\ndescription: d\n---\nbody", "named 'other'"),
        ("---\nname: a\n---\nbody", "no description"),
        ("---\nname: a\ndescription: d\n---\n", "no body"),
        (f"---\nname: a\ndescription: d\n---\n{'word ' * 251}", "body is over"),
        (
            f"---\nname: a\ndescription: {'word ' * 41}\n---\nbody",
            "description is over",
        ),
        ("---\nname: a\ndescription: >\n  folded\n---\nbody", "block scalar"),
        ("---\nname: a\ndescription: |\n  literal\n---\nbody", "block scalar"),
        ("---\nname: a\ndescription: d\ndescription: e\n---\nbody", "given twice"),
        ("---\nname: a\ndescription: d\n  more\n---\nbody", "not key: value"),
    ],
)
def test_a_skill_that_breaks_the_format_is_refused_naming_the_file(
    tmp_path, text, complaint
):
    with pytest.raises(ValueError, match=complaint) as refused:
        parse(written(tmp_path, "a", text))

    assert "a/SKILL.md" in str(refused.value)


def test_a_byte_order_mark_does_not_hide_the_frontmatter(tmp_path):
    path = written(tmp_path, "a", b"\xef\xbb\xbf" + GOOD.encode())

    assert parse(path).name == "a"


@pytest.mark.parametrize("quote", ["'", '"'])
def test_matching_quotes_around_a_value_are_removed(tmp_path, quote):
    text = f"---\nname: {quote}a{quote}\ndescription: {quote}Use: it.{quote}\n---\nDo."

    skill = parse(written(tmp_path, "a", text))

    assert (skill.name, skill.description) == ("a", "Use: it.")


def test_a_bad_skill_is_logged_and_left_out_while_the_others_are_kept(tmp_path, caplog):
    written(tmp_path, "a", GOOD)
    written(tmp_path, "b", "---\nname: b\ndescription: >\n  x\n---\nbody")
    written(tmp_path, "c", GOOD.replace("name: a", "name: wrong"))

    with caplog.at_level(logging.ERROR, logger="app.agent.skills.registry"):
        found = read_all(tmp_path)

    assert list(found) == ["a"]
    assert "b/SKILL.md" in caplog.text and "c/SKILL.md" in caplog.text


def test_a_file_that_is_not_text_is_left_out(tmp_path):
    written(tmp_path, "a", b"\xff\xfe\x00bad")

    assert read_all(tmp_path) == {}


def test_the_worker_uploads_every_skill_file():
    """The Worker reads SKILL.md beside its module, as it reads the school
    catalogue, but Markdown is only uploaded when a rule says so."""
    config = re.sub(
        r"^\s*//.*$", "", (SERVER / "wrangler.jsonc").read_text(), flags=re.MULTILINE
    )
    uploaded = [
        glob
        for rule in json.loads(config)["rules"]
        if rule["type"] == "Text" and rule.get("fallthrough") is True
        for glob in rule["globs"]
    ]
    shipped = [
        path.relative_to(SERVER / "src") for path in SKILLS_DIR.glob("*/SKILL.md")
    ]

    assert len(shipped) >= len(FIRST_SKILLS)
    for path in shipped:
        assert any(path.full_match(glob) for glob in uploaded), path
