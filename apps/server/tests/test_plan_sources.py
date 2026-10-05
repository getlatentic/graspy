"""Which official curriculum a plan's subjects follow, as the plan carries it between devices."""

from app.learner.plan import Plan, joined

NERDC = {
    "packageId": "ai.graspy.curriculum.ng.nerdc.jss1.mathematics",
    "packageRevision": 2,
    "authority": "NERDC",
    "title": "Mathematics · JSS 1",
    "edition": "September 2025",
}


def plan(
    plan_id: str, subjects: list[str], sources: dict | None = None, updated: int = 1
) -> Plan:
    return Plan.model_validate(
        {
            "planId": plan_id,
            "updatedAt": updated,
            "country": "NG",
            "language": "en",
            "gradeLevel": "JSS 1",
            "subjects": [{"name": s.title(), "slug": s} for s in subjects],
            "topics": {s: [f"{s} 1"] for s in subjects},
            **({"sources": sources} if sources is not None else {}),
        }
    )


def test_a_plan_keeps_its_subjects_sources_and_drops_a_removed_subjects():
    kept = plan("p", ["mathematics"], {"mathematics": NERDC, "english": NERDC})
    assert kept.sources() == {"mathematics": NERDC}
    assert '"sources":{"mathematics"' in kept.json()


def test_a_plan_without_sources_has_none_and_writes_none():
    bare = plan("p", ["mathematics"])
    assert bare.sources() == {}
    assert "sources" not in bare.json()


def test_a_joining_device_brings_its_added_subjects_sources():
    account = plan("a", ["english"], updated=2)
    device = plan("d", ["english", "mathematics"], {"mathematics": NERDC})

    merged = joined(account, device, now=3).plan

    assert [s.slug for s in merged.subjects] == ["english", "mathematics"]
    assert merged.sources() == {"mathematics": NERDC}


def test_the_accounts_own_subjects_keep_the_accounts_sources():
    account = plan("a", ["mathematics"], {"mathematics": NERDC}, updated=2)
    device = plan("d", ["mathematics", "english"])

    assert joined(account, device, now=3).plan.sources() == {"mathematics": NERDC}
