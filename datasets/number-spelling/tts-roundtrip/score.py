"""Scores the transcripts in a round-trip run against the readings a teacher would give.

  python3 score.py roundtrip.jsonl > scored.jsonl   (and a summary on stderr)

Whisper writes what it hears in written form ("1960", "3.30", "12:45", "$500"), the readings are
spelled out ("nineteen sixty", "three thirty"). Both are reduced to the same shape first: number
words become digits, digits split by ".", ":" or "," are joined, runs of number tokens are joined
(so "nineteen sixty" and "1960" agree), and currency signs, which are not spoken, are dropped.
"""
import json, re, statistics, sys
from collections import defaultdict
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from run import edit_distance  # noqa: E402

UNITS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}


def number_tokens(words):
    """Number words as digits: thousands, millions and hundreds joined, "five ten" kept as two numbers."""
    out, total, group, last, active = [], 0, 0, None, False
    def flush():
        nonlocal total, group, last, active
        if active: out.append(str(total + group))
        total, group, last, active = 0, 0, None, False
    for w in words:
        if w == "and" and active and (total or group >= 100): continue
        kind = "unit" if w in UNITS and 1 <= UNITS.index(w) <= 9 else "teen" if w in UNITS and UNITS.index(w) >= 10 else "zero" if w == "zero" else "tens" if w in TENS else w if w in ("hundred", "thousand", "million") else None
        if kind is None or kind == "zero":
            flush()
            if kind == "zero": out.append("0")
            else: out.append(w)
            continue
        if kind in ("unit", "teen", "tens") and active and (last in ("unit", "teen") or (last == "tens" and kind != "unit")): flush()
        if kind == "unit": group += UNITS.index(w)
        elif kind == "teen": group += UNITS.index(w)
        elif kind == "tens": group += TENS[w]
        elif kind == "hundred":
            if not active: flush()
            group = (group or 1) * 100
        elif kind in ("thousand", "million"):
            total += (group or 1) * (1000 if kind == "thousand" else 1_000_000); group = 0
        last, active = kind, True
    flush()
    return out


def digits_for_words(words):
    return number_tokens(words)


def canon(text):
    t = text.lower().replace("%", " percent ").replace("₦", " ").replace("$", " ")
    t = re.sub(r"(?<=\d)[.:,](?=\d)", "", t)          # 3.30 and 12:45 and 1,000 are single numbers
    t = re.sub(r"[-‐-–]", " ", t)
    t = re.sub(r"\b(\w*(?:met|lit))er(s?)\b", r"\1re\2", t)   # meters and metres are one word
    words = re.findall(r"[a-z']+|\d+", t)
    tokens = digits_for_words(words)
    tokens = [t for k, t in enumerate(tokens) if not (t == "point" and 0 < k < len(tokens) - 1 and tokens[k - 1].isdigit() and tokens[k + 1].isdigit())]
    out = []
    for tok in tokens:                                # runs of numbers read as one: "19 60" is "1960"
        if tok.isdigit() and out and out[-1].isdigit(): out[-1] += tok
        else: out.append(tok)
    return out


def similarity(transcript, readings):
    hyp = canon(transcript)
    best = 0.0
    for ref in readings:
        r = canon(ref)
        best = max(best, max(0.0, 1 - edit_distance(hyp, r) / max(1, len(r))))
    return round(best, 3), any(canon(transcript) == canon(x) for x in readings)


if __name__ == "__main__":
    rows = [json.loads(l) for l in open(sys.argv[1])]
    for r in rows:
        if r["transcript"] is None: continue
        r["similarity"], r["exact"] = similarity(r["transcript"], r["readings"])
        print(json.dumps(r, ensure_ascii=False))
