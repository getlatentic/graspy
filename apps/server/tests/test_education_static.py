"""The school systems the web app serves itself are what the API would answer."""

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).parents[1] / "scripts" / "education"
sys.path.insert(0, str(SCRIPTS))

from export_static import OUT, country_codes, render

CODES = country_codes()


def test_every_country_the_app_offers_has_a_file_and_none_is_left_over():
    assert len(CODES) > 200
    assert sorted(path.stem for path in OUT.glob("*.json")) == CODES


@pytest.mark.parametrize("code", CODES)
def test_a_countrys_file_is_what_the_api_answers(code):
    assert (OUT / f"{code}.json").read_text() == render(code), (
        "run scripts/education/export_static.py"
    )
