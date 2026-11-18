import base64
import importlib.util
import json
from pathlib import Path

import pytest

from app.domains.curriculum.packages.export import COURSES, REPOSITORY, read_package

SCRIPT = Path(__file__).parents[1] / "scripts" / "curriculum_revision_diff.py"
spec = importlib.util.spec_from_file_location("curriculum_revision_diff", SCRIPT)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

HELD = json.loads(COURSES.read_text(encoding="utf-8"))[0]["package"]


def _node(code, kind, parent, sequence):
    return {"code": code, "kind": kind, "parentCode": parent, "sequence": sequence}


def _objective(code, node, statement):
    return {"code": code, "nodeCode": node, "statement": statement, "sequence": 1}


def _package(tmp_path, name, revision, objectives, package_id="p.test"):
    nodes = [
        _node("t1", "theme", None, 1),
        _node("topic-a", "topic", "t1", 1),
        _node("topic-b", "topic", "t1", 2),
        _node("sub-a1", "subtopic", "topic-a", 1),
        _node("sub-a2", "subtopic", "topic-a", 2),
        _node("sub-b1", "subtopic", "topic-b", 1),
        _node("po-a1", "performance_objective", "sub-a1", 1),
        _node("po-a2", "performance_objective", "sub-a2", 1),
        _node("po-b1", "performance_objective", "sub-b1", 1),
    ]
    payload = {
        "packageId": package_id,
        "packageRevision": revision,
        "courses": [
            {"courseKey": "maths", "nodes": nodes, "objectives": objectives},
        ],
    }
    envelope = {
        "schemaVersion": 2,
        "payload": base64.b64encode(json.dumps(payload).encode()).decode(),
    }
    path = tmp_path / name
    path.write_text(json.dumps(envelope))
    return str(path)


def _revision_one(tmp_path):
    return _package(
        tmp_path,
        "one",
        1,
        [
            _objective("count", "po-a1", "Count to ten."),
            _objective("add", "po-a1", "Add two numbers."),
            _objective("take", "po-a2", "Subtract one number."),
            _objective("share", "po-b1", "Share equally."),
        ],
    )


def _revision_two(tmp_path):
    return _package(
        tmp_path,
        "two",
        2,
        [
            _objective("count", "po-a1", "Count to twenty."),
            _objective("add", "po-a1", "Add two numbers."),
            _objective("take", "po-b1", "Subtract one number."),
            _objective("double", "po-a2", "Double a number."),
        ],
    )


def _diff(old, new):
    old, new = tool.load(old), tool.load(new)
    return old, new, tool.diff(old, new)["maths"]


def test_it_lists_added_removed_reworded_and_moved_objectives_by_code(tmp_path):
    _, _, change = _diff(_revision_one(tmp_path), _revision_two(tmp_path))
    assert [o.code for o in change.added] == ["double"]
    assert [o.code for o in change.removed] == ["share"]
    assert [(a.statement, b.statement) for a, b in change.reworded] == [
        ("Count to ten.", "Count to twenty.")
    ]
    assert [(a.subtopic, b.subtopic) for a, b in change.moved] == [("sub-a2", "sub-b1")]
    assert [(a.topic, b.topic) for a, b in change.moved] == [("topic-a", "topic-b")]


def test_an_objective_moved_to_another_subtopic_of_the_same_topic_is_moved(tmp_path):
    one = _revision_one(tmp_path)
    two = _package(
        tmp_path,
        "moved",
        2,
        [
            _objective("count", "po-a2", "Count to ten."),
            _objective("add", "po-a1", "Add two numbers."),
            _objective("take", "po-a2", "Subtract one number."),
            _objective("share", "po-b1", "Share equally."),
        ],
    )
    _, _, change = _diff(one, two)
    assert [o.code for _, o in change.moved] == ["count"]
    assert not (change.added or change.removed or change.reworded)


def test_a_reworded_objective_that_also_moved_is_in_both_lists(tmp_path):
    one = _revision_one(tmp_path)
    two = _package(
        tmp_path,
        "both",
        2,
        [
            _objective("count", "po-b1", "Count to twenty."),
            _objective("add", "po-a1", "Add two numbers."),
            _objective("take", "po-a2", "Subtract one number."),
            _objective("share", "po-b1", "Share equally."),
        ],
    )
    _, _, change = _diff(one, two)
    assert [b.code for _, b in change.reworded] == ["count"]
    assert [b.code for _, b in change.moved] == ["count"]


def test_the_report_names_the_revisions_and_each_change(tmp_path):
    old, new, _ = _diff(_revision_one(tmp_path), _revision_two(tmp_path))
    text = tool.render(old, new, tool.diff(old, new))
    assert "revision 1" in text and "-> 2" in text
    assert "added    double" in text
    assert "removed  share" in text
    assert "reworded count" in text and "now: Count to twenty." in text
    assert "moved    take  topic-a / sub-a2 -> topic-b / sub-b1" in text
    assert "1 added, 1 removed, 1 reworded, 1 moved" in text


def test_the_held_package_against_itself_has_no_change():
    path = str(REPOSITORY / HELD)
    old = new = tool.load(path)
    assert sum(len(o) for o in old.courses.values()) == 158
    change = tool.diff(old, new)["mathematics-jss1"]
    assert change.empty()
    assert "no change" in tool.render(old, new, {"mathematics-jss1": change})


def test_the_held_package_read_from_git_equals_itself():
    spec = f"HEAD:{HELD}"
    old, new = tool.load(spec), tool.load(spec)
    assert old.sha256 == new.sha256 == read_package(REPOSITORY / HELD)[1]
    assert tool.diff(old, new)["mathematics-jss1"].empty()


def test_a_changed_copy_of_the_held_package_shows_exactly_the_change(tmp_path):
    envelope = json.loads((REPOSITORY / HELD).read_text(encoding="utf-8"))
    payload = json.loads(base64.b64decode(envelope["payload"]))
    objectives = payload["courses"][0]["objectives"]
    removed = objectives.pop()
    objectives[0]["statement"] += " Carefully."
    payload["packageRevision"] = 3
    envelope["payload"] = base64.b64encode(json.dumps(payload).encode()).decode()
    changed = tmp_path / "changed"
    changed.write_text(json.dumps(envelope))
    old, new = tool.load(str(REPOSITORY / HELD)), tool.load(str(changed))
    change = tool.diff(old, new)["mathematics-jss1"]
    assert [o.code for o in change.removed] == [removed["code"]]
    assert [b.code for _, b in change.reworded] == [objectives[0]["code"]]
    assert not (change.added or change.moved)


def test_two_different_packages_are_not_compared(tmp_path):
    one = _revision_one(tmp_path)
    other = _package(tmp_path, "other", 1, [], package_id="p.other")
    with pytest.raises(ValueError, match="different packages"):
        tool.diff(tool.load(one), tool.load(other))


def test_the_command_prints_the_report_and_fails_on_a_bad_source(tmp_path, capsys):
    one, two = _revision_one(tmp_path), _revision_two(tmp_path)
    assert tool.main([one, two]) == 0
    assert "added    double" in capsys.readouterr().out
    assert tool.main([one, str(tmp_path / "missing")]) == 2
    assert "error:" in capsys.readouterr().err


def test_a_package_that_does_not_hang_together_is_refused(tmp_path):
    twice = _package(
        tmp_path,
        "twice",
        1,
        [_objective("a", "po-a1", "One."), _objective("a", "po-a2", "Two.")],
    )
    with pytest.raises(ValueError, match="twice"):
        tool.load(twice)
    orphan = _package(tmp_path, "orphan", 1, [_objective("a", "nowhere", "One.")])
    with pytest.raises(ValueError, match="not in the package"):
        tool.load(orphan)
    cycle = {
        "x": {"code": "x", "kind": "topic", "parentCode": "y"},
        "y": {"code": "y", "kind": "theme", "parentCode": "x"},
    }
    with pytest.raises(ValueError, match="cycle"):
        tool._place(cycle, "x")


def test_a_source_that_looks_like_a_git_option_is_not_given_to_git(tmp_path):
    target = tmp_path / "written"
    with pytest.raises(FileNotFoundError):
        tool.load(f"--output={target}:x")
    assert not target.exists()
