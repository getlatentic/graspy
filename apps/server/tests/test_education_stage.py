"""The learner's stage and age, found through the catalogue from the class
the apps name."""

import pytest

from app.education.catalogue import systems
from app.education.route import descriptor
from app.education.stage import LearnerStage, Stage, stage_of


def nigerian(level_id: str) -> str:
    """The class as the apps name it."""
    nigeria = systems()["NG"]
    level = next(level for level in nigeria.levels if level.id == level_id)
    return descriptor(nigeria, level)


@pytest.mark.parametrize(
    ("level", "stage", "age"),
    [
        ("nursery-1", Stage.EARLY_YEARS, 3),
        ("kindergarten", Stage.EARLY_YEARS, 5),
        ("primary-1", Stage.LOWER_PRIMARY, 6),
        ("primary-2", Stage.LOWER_PRIMARY, 7),
        ("primary-3", Stage.LOWER_PRIMARY, 8),
        ("primary-4", Stage.UPPER_PRIMARY, 9),
        ("primary-5", Stage.UPPER_PRIMARY, 10),
        ("primary-6", Stage.UPPER_PRIMARY, 11),
        ("jss-1", Stage.JUNIOR_SECONDARY, 12),
        ("jss-3", Stage.JUNIOR_SECONDARY, 14),
        ("sss-1", Stage.SENIOR_SECONDARY, 15),
        ("sss-2", Stage.SENIOR_SECONDARY, 16),
        ("sss-3", Stage.SENIOR_SECONDARY, 17),
    ],
)
def test_a_nigerian_class_has_its_stage_and_age(level, stage, age):
    assert stage_of(nigerian(level)) == LearnerStage(stage, age)


def test_a_class_is_read_as_the_apps_name_it():
    assert stage_of("Primary 2 (Primary), Nigeria, age 7") == LearnerStage(
        Stage.LOWER_PRIMARY, 7
    )


@pytest.mark.parametrize(
    "grade_level",
    ["Undergraduate student, studying Accounting", "Graduate student, studying Law"],
)
def test_a_learner_after_school_is_an_adult(grade_level):
    assert stage_of(grade_level) == LearnerStage(Stage.AFTER_SCHOOL, None)


@pytest.mark.parametrize(
    "grade_level",
    [None, "", "Standard", "JSS 1", "Primary 2", "Primary 2 (Primary), Nigeria"],
)
def test_a_class_the_catalogue_cannot_place_has_no_stage(grade_level):
    assert stage_of(grade_level) is None


def test_every_class_in_the_catalogue_has_a_stage_that_follows_its_year():
    order = list(Stage)
    for system in systems().values():
        found = [stage_of(descriptor(system, level)) for level in system.levels]
        assert None not in found, system.id
        stages = [order.index(learner.stage) for learner in found]
        assert stages == sorted(stages), system.id


def test_a_stage_is_described_with_its_age():
    assert LearnerStage(Stage.LOWER_PRIMARY, 7).described() == "lower primary, age 7"
    assert (
        LearnerStage(Stage.AFTER_SCHOOL, None).described() == "after school, an adult"
    )
