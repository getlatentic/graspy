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
from run import digits_for_words, edit_distance  # noqa: E402


def canon(text):
    t = text.lower().replace("%", " percent ").replace("₦", " ").replace("$", " ")
    t = re.sub(r"(?<=\d)[.:,](?=\d)", "", t)          # 3.30 and 12:45 and 1,000 are single numbers
    t = re.sub(r"[-‐-–]", " ", t)
    words = re.findall(r"[a-z']+|\d+", t)
    tokens = digits_for_words(words)
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
