"""The catalogue of school systems."""

import pytest

from app.education.catalogue import SYSTEMS, checked, systems
from app.education.checks import problems
from app.education.model import System

FILES = sorted(SYSTEMS.glob("*.json"))
# The countries the app serves first: checked against official sources.
TIER_ONE = {"NG", "US", "GB", "CA", "GH", "KE", "ZA"}


def system(**changes) -> System:
    """Nigeria as a draft, with the changes."""
    levels = [
        *(
            {
                "id": f"primary-{n}",
                "stage": "primary",
                "year": n,
                "age": 5 + n,
                "name": {"en": f"Primary {n}"},
            }
            for n in range(1, 7)
        ),
        *(
            {
                "id": f"jss-{n}",
                "stage": "jss",
                "year": 6 + n,
                "age": 11 + n,
                "name": {"en": f"JSS {n}"},
            }
            for n in range(1, 4)
        ),
        *(
            {
                "id": f"ss-{n}",
                "stage": "ss",
                "year": 9 + n,
                "age": 14 + n,
                "name": {"en": f"SS {n}"},
            }
            for n in range(1, 4)
        ),
    ]
    values = {
        "id": "NG",
        "country": "NG",
        "name": {"en": "Nigeria"},
        "status": "draft",
        "draftedBy": "claude-code",
        "stages": [
            {"id": "primary", "name": {"en": "Primary"}},
            {"id": "jss", "name": {"en": "Junior Secondary"}},
            {"id": "ss", "name": {"en": "Senior Secondary"}},
        ],
        "levels": levels,
    } | changes
    return System.model_validate(values)


@pytest.mark.parametrize("path", FILES, ids=[path.stem for path in FILES])
def test_every_committed_system_is_whole(path):
    assert checked(path)[1] == []


def test_the_first_countries_are_checked_against_official_sources():
    main = {s.country: s for s in systems().values() if s.main}

    assert TIER_ONE <= set(main)
    for country in TIER_ONE:
        assert main[country].status in ("sourced", "reviewed"), country
        assert main[country].sources, country


def test_a_countrys_systems_have_one_main_one():
    by_country: dict[str, list[System]] = {}
    for found in systems().values():
        by_country.setdefault(found.country, []).append(found)

    for country, found in by_country.items():
        assert sum(s.main for s in found) == 1, country


def test_a_whole_system_has_no_problems():
    assert problems(system()) == []


@pytest.mark.parametrize(
    ("changes", "problem"),
    [
        pytest.param(
            {"status": "sourced"}, "must cite them", id="sourced-without-sources"
        ),
        pytest.param(
            {"status": "reviewed", "sources": [{"title": "t", "url": "https://x.org"}]},
            "who reviewed it",
            id="reviewed-without-review",
        ),
        pytest.param(
            {"draftedBy": None}, "name who wrote it", id="draft-without-model"
        ),
        pytest.param(
            {"id": "GH"}, "is not in country NG", id="system-in-another-country"
        ),
    ],
)
def test_a_system_that_cannot_be_trusted_is_refused(changes, problem):
    found = problems(system(**changes))

    assert any(problem in item for item in found), found


def test_a_missing_year_is_refused():
    whole = system()
    gap = whole.model_copy(update={"levels": whole.levels[:3] + whole.levels[4:]})

    assert "school years 1, 2, 3 and on" in problems(gap)[0]


def test_a_stage_split_in_two_is_refused():
    whole = system()
    levels = [
        level.model_copy(update={"stage": "primary"}) if level.year == 8 else level
        for level in whole.levels
    ]

    found = problems(whole.model_copy(update={"levels": levels}))

    assert "A stage's years must follow one another." in found


def test_ages_that_skip_or_repeat_are_refused():
    whole = system()
    levels = [
        level.model_copy(update={"age": level.age + 1}) if level.year >= 7 else level
        for level in whole.levels
    ]

    found = problems(whole.model_copy(update={"levels": levels}))

    assert any("a year older than the one before" in item for item in found)


def test_school_starting_outside_3_to_9_is_refused():
    whole = system()
    levels = [level.model_copy(update={"age": level.age + 5}) for level in whole.levels]

    found = problems(whole.model_copy(update={"levels": levels}))

    assert "School starts at age 11, outside 3 to 9." in found


def test_another_system_in_a_country_must_cite_its_sources():
    found = problems(system(id="NG-SCT", main=False))

    assert any("must cite its sources" in item for item in found)
