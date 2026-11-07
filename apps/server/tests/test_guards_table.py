"""docs/TUTOR_GUARDS.md names the code and the tests that hold each rule, so a rename cannot leave it pointing at nothing."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
DOC = (ROOT / "docs" / "TUTOR_GUARDS.md").read_text()
SERVER = ROOT / "apps" / "server"
TESTS = sorted(set(re.findall(r"`(test_\w+\.py)::(test_\w+)`", DOC)))
FILES = sorted(set(re.findall(r"`(agent/\w+\.py)`", DOC)))


def test_the_table_names_tests():
    assert len(TESTS) >= 10


@pytest.mark.parametrize(("file", "name"), TESTS)
def test_a_test_the_table_names_exists(file, name):
    source = (SERVER / "tests" / file).read_text()

    assert re.search(rf"^(async )?def {name}\(", source, re.MULTILINE)


@pytest.mark.parametrize("file", FILES)
def test_a_module_the_table_names_exists(file):
    assert (SERVER / "src" / "app" / file).is_file()
