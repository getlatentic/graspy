"""Subject slugs. apps/web/src/lib/slug.ts must agree character for
character, or one subject lands twice; tests/test_slug_parity.py pins both to
one corpus."""

import re
import unicodedata

# Letters with no Unicode decomposition. Dropping Hausa's hooked consonants
# would make "Baƙi" and "Bai" one subject.
TRANSLITERATIONS = {
    "ɓ": "b",
    "ɗ": "d",
    "ƙ": "k",
    "ƴ": "y",
    "ø": "o",
    "æ": "ae",
    "œ": "oe",
    "å": "a",
    "ß": "ss",
    "ð": "d",
    "þ": "th",
    "ł": "l",
    "đ": "d",
}

# Letters and digits of every script survive, or every Arabic subject would
# be "subject".
_SEPARATORS = re.compile(r"[\W_]+")


def _unmarked(value: str) -> str:
    """Without accents, tone marks or Arabic vowel marks."""
    # Decomposed before lowercasing, since "𝕬" has no lowercase until it
    # becomes "A", and again after, since lowercasing "İ" adds a mark.
    decomposed = unicodedata.normalize(
        "NFKD", unicodedata.normalize("NFKD", value).lower()
    )
    return "".join(
        char for char in decomposed if not unicodedata.category(char).startswith("M")
    )


def slugify(value: str) -> str:
    folded = "".join(TRANSLITERATIONS.get(char, char) for char in _unmarked(value))
    return _SEPARATORS.sub("-", folded).strip("-") or "subject"
