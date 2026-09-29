import json,sys,subprocess,urllib.request,time
from collections import Counter
D,S,KEYFILE=sys.argv[1:4]
K=[l.split("=",1)[1].strip() for l in open(KEYFILE) if l.startswith("AWS_BEARER_TOKEN_BEDROCK=")][0]
lines=[json.loads(l) for l in open(D+"/lines.jsonl") if any(c.isdigit() for c in json.loads(l)["line"])]
L={l["id"]:l["line"] for l in lines}
BRIEF='''Rewrite the line below for a voice to read aloud to a child, in English. Change only the numbers, signs and units, into the words a teacher says. Keep every other word, and every comma, full stop, question mark and exclamation mark, exactly as it is.
- Write every number in words.
- + is plus, = is equals, x is times, - between numbers is minus, > is greater than, < is less than, % is percent.
- The word naira comes after the amount: write forty naira for ₦40.
- kg is kilograms, g is grams, cm is centimetres, mm is millimetres, km is kilometres, ml is millilitres.
- 3:30 is three thirty, 8:00 is eight o'clock, 7:05 is seven oh five.
- 5-10 is five to ten, and 1st is first.

Examples:
Line: You paid ₦35 for 9 mangoes.
Rewritten: You paid thirty-five naira for nine mangoes.
Line: 6 + 8 = 14. Is 14 > 9?
Rewritten: Six plus eight equals fourteen. Is fourteen greater than nine?
Line: The bell rings at 9:20, and the rope is 18 cm long!
Rewritten: The bell rings at nine twenty, and the rope is eighteen centimetres long!

Reply with the rewritten line only, ending exactly as the line ends.
Line: "{line}"
Rewritten:'''
def call(prompt):
    req=urllib.request.Request("https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions",data=json.dumps({"model":"google.gemma-4-e2b","messages":[{"role":"user","content":prompt}],"temperature":0,"max_completion_tokens":300}).encode(),headers={"Authorization":"Bearer "+K,"content-type":"application/json"})
    t=time.time()
    try: r=json.load(urllib.request.urlopen(req,timeout=60)); return r["choices"][0]["message"].get("content"),int((time.time()-t)*1000)
    except Exception as e: return None,0
res=[]
for l in lines:
    c,ms=call(BRIEF.replace("{line}",l["line"].replace('"',"'")))
    res.append({"id":l["id"],"reply":c,"ms":ms})
pairs=[{"id":r["id"],"line":L[r["id"]],"reply":r["reply"]} for r in res]
out=subprocess.run(["curl","-s","-m","300","localhost:8797","-d","@-"],input=json.dumps({"pairs":pairs}),capture_output=True,text=True).stdout
ver={x["id"]:x["verdict"] for x in json.loads(out)}
print(Counter(ver.values()),"median ms",sorted(r["ms"] for r in res)[len(res)//2],"max",max(r["ms"] for r in res))
for r in res:
    if ver[r["id"]]=="fail": print(f'  {r["id"]:30} {L[r["id"]]!r} -> {r["reply"]!r}')
json.dump({"replies":res,"verdicts":ver},open(S+"/e2b-latest.json","w"),ensure_ascii=False)
