"""Speaks each model's version of each line with Spitch, transcribes it with Whisper, and scores the
transcript against the readings a teacher would give. See ../README.md.

  npx wrangler dev --config whisper/wrangler.jsonc --port 8797     (in another terminal)
  python3 run.py --vars <.dev.vars with SPITCH_API_KEY> --probe http://localhost:8797 --out out.jsonl
  python3 score.py out.jsonl > scored.jsonl
"""
import argparse, base64, hashlib, json, re, subprocess, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASET = HERE.parent
MODELS = {  # results file, model name in it, host, and the prompt when the file holds several
    "gpt-oss-20b": ("results.jsonl", None, "workers-ai"),
    "llama-4-scout": ("results-llama-gemma.jsonl", "llama-4-scout-17b-16e-instruct", "workers-ai"),
    "qwen3-next-80b": ("results-qwen.jsonl", "qwen3-next-80b-a3b-instruct", "bedrock"),
    "qwen3-32b": ("results-qwen.jsonl", "qwen3-32b", "bedrock"),
    "gemma-3-12b": ("results-llama-gemma.jsonl", "gemma-3-12b-it", "bedrock"),
    "gemma-4-e2b": ("results-gemma-4.jsonl", "gemma-4-e2b", "bedrock"),
    "gemma-4-e2b-v4": ("results-gemma-4-e2b-prompts.jsonl", "gemma-4-e2b", "bedrock", "v4"),
}
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = [None, None, "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def extend(cur, w):
    small = ONES.index(w) if w in ONES else -1
    tens = TENS.index(w) if w in TENS else -1
    if cur is None:
        return small if small >= 0 else (tens * 10 if tens >= 2 else None)
    after_hundred = cur >= 100 and cur % 100 == 0
    after_tens = cur % 100 >= 20 and cur % 10 == 0
    if 1 <= small <= 9 and (after_hundred or after_tens): return cur + small
    if small >= 10 and after_hundred: return cur + small
    if tens >= 2 and after_hundred: return cur + tens * 10
    if w == "hundred" and cur is not None and 1 <= cur <= 9: return cur * 100
    return None


def digits_for_words(words):
    out, cur = [], None
    for w in words:
        if w == "and" and cur is not None and cur >= 100: continue
        nxt = extend(cur, w)
        if nxt is not None and cur is not None: cur = nxt; continue
        if cur is not None: out.append(str(cur))
        cur = extend(None, w)
        if cur is None: out.append(w)
    if cur is not None: out.append(str(cur))
    return out


def norm(text):
    t = text.lower().replace("₦", " naira ").replace("%", " percent ")
    t = re.sub(r"(?<=\d),(?=\d{3})", "", t)
    t = re.sub(r"[-‐-–]", " ", t)
    words = re.findall(r"[a-z']+|\d+(?:\.\d+)?", t)
    return digits_for_words(words)


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def score(transcript, readings):
    hyp = norm(transcript)
    best = 0.0
    for ref in readings:
        r = norm(ref)
        best = max(best, max(0.0, 1 - edit_distance(hyp, r) / max(1, len(r))))
    return round(best, 3)


def spitch(text, key, cache):
    f = cache / (hashlib.sha1(text.encode()).hexdigest()[:20] + ".wav")
    if f.exists(): return f.read_bytes()
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://api.spitch.app/v1/speech", data=json.dumps({"text": text, "voice": "lucy", "language": "en", "format": "wav"}).encode(),
                                         headers={"Authorization": "Bearer " + key, "content-type": "application/json"})
            audio = urllib.request.urlopen(req, timeout=40).read()
            f.write_bytes(audio); time.sleep(0.3); return audio
        except Exception as e:
            time.sleep(1.5 * (attempt + 1)); last = e
    raise RuntimeError(f"Spitch failed for {text!r}: {last}")


def whisper(items, probe):
    r = subprocess.run(["curl", "-s", "-m", "300", probe, "-d", "@-"], input=json.dumps({"items": items}), capture_output=True, text=True)
    return {x["id"]: x for x in json.loads(r.stdout)}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--vars", required=True); ap.add_argument("--probe", default="http://localhost:8797"); ap.add_argument("--out", default="roundtrip.jsonl")
    args = ap.parse_args()
    key = next(l.split("=", 1)[1].strip() for l in open(args.vars) if l.startswith("SPITCH_API_KEY="))
    refs = {json.loads(l)["id"]: json.loads(l)["readings"] for l in open(HERE / "references.jsonl")}
    lines = {json.loads(l)["id"]: json.loads(l)["line"] for l in open(DATASET / "lines.jsonl")}
    replies = {}
    for name, (file, model, host, *prompt) in MODELS.items():
        for l in open(DATASET / file):
            r = json.loads(l)
            if prompt and r.get("prompt") != prompt[0]: continue
            if r["host"] == host and (model is None or r.get("model") == model) and r["id"] in refs: replies[(name, r["id"])] = r["reply"] or ""
    cache = HERE / ".audio"; cache.mkdir(exist_ok=True)
    jobs = {}
    for i in refs:
        variants = {"original": lines[i]}
        for name in MODELS: variants[name] = replies.get((name, i)) or lines[i]
        for name, text in variants.items(): jobs.setdefault((i, text), []).append(name)
    print(len(jobs), "clips to speak and transcribe", flush=True)
    done = 0; batch = []; out = open(args.out, "w")
    def flush():
        got = whisper([{"id": str(k), "audio": a} for k, (_, _, _, a) in enumerate(batch)], args.probe)
        for k, (i, text, names, _) in enumerate(batch):
            g = got[str(k)]
            rec = {"id": i, "spoken_text": text, "variants": names, "transcript": g.get("text"), "similarity": score(g["text"], refs[i]) if g.get("text") is not None else None,
                   "exact": (norm(g["text"]) in [norm(x) for x in refs[i]]) if g.get("text") is not None else None, "readings": refs[i]}
            out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()
        batch.clear()
    for (i, text), names in jobs.items():
        audio = spitch(text, key, cache)
        batch.append((i, text, names, base64.b64encode(audio).decode()))
        done += 1
        if len(batch) == 8: flush(); print(done, "of", len(jobs), flush=True)
    if batch: flush()
    print("finished", done, flush=True)


if __name__ == "__main__": main()
