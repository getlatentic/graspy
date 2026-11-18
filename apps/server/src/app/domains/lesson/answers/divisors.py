"""The LCM or HCF of whole numbers ("What is the LCM of 8, 12 and 15?") and
the LCD of fractions ("the LCD of 7/12 and 5/8"). Raises NotComputable for
anything else."""

from __future__ import annotations

import math
import re
from fractions import Fraction

from .asked import Asked, Worked
from .expression import NotComputable
from .wanted import Wanted

_LEAST = r"lcm|l\.c\.m\.?|(?:least|lowest|smallest)\s+common\s+multiple|lcd|(?:least|lowest)\s+common\s+denominator"
_GREATEST = r"hcf|h\.c\.f\.?|gcd|g\.c\.d\.?|greatest\s+common\s+(?:divisor|factor)|highest\s+common\s+(?:factor|divisor)"
_ITEM = r"\d+(?:[/⁄]\d+)?"
_QUESTION = re.compile(
    rf"""^\s*(?:what\s+is|find|calculate|work\s+out|determine)\s+the\s+
        (?:(?P<least>{_LEAST})|(?P<greatest>{_GREATEST}))
        (?:\s*\(\s*[A-Za-z.]+\s*\))?\s+of\s+(?:the\s+(?:fractions|numbers)\s+)?
        (?P<items>{_ITEM}(?:\s*(?:,|and|&)\s*(?:and\s+)?{_ITEM})+)(?:\s+before\s+[a-z\s]+)?\s*[?.:]?\s*$""",
    re.IGNORECASE | re.VERBOSE,
)
_LEAST_OF_DENOMINATORS = re.compile(r"lcd|denominator", re.IGNORECASE)
_THOUSANDS = re.compile(r"\d,\d")  # 1,200 is one number here, not two
MOST_ITEMS = 5
MOST_VALUE = 10**6


def _items(listed: str) -> list[str]:
    return re.findall(_ITEM, listed)


def _denominator(item: str) -> int:
    """5 is 5/1."""
    parts = re.split(r"[/⁄]", item)
    return int(parts[1]) if len(parts) == 2 else 1


def divisor(text: str) -> Asked:
    found = _QUESTION.match(text)
    if found is None or _THOUSANDS.search(text):
        raise NotComputable("not an LCM or HCF question")
    items = _items(found["items"])
    if not 2 <= len(items) <= MOST_ITEMS:
        raise NotComputable("too few or too many numbers")
    if found["least"] and _LEAST_OF_DENOMINATORS.search(found["least"]):
        numbers = [_denominator(item) for item in items]
    elif any(re.search(r"[/⁄]", item) for item in items):
        raise NotComputable("fractions have no LCM or HCF here")
    else:
        numbers = [int(item) for item in items]
    if min(numbers) < 1 or max(numbers) > MOST_VALUE:
        raise NotComputable("numbers out of range")
    combine = math.lcm if found["least"] else math.gcd
    return Asked(Fraction(combine(*numbers)), Wanted(), Worked.DIVISORS)
