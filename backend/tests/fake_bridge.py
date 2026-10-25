"""Stand-in for infra/hermes/native_bridge.py: replays scripted JSON lines.

argv[1] is a JSON file mapping a search term (or "*") to a list of steps. A step is a line to
print, or one of {"sleep": seconds}, {"die": true}, {"raw": text}, {"echo_request": true}.
"""
import json
import os
import sys
import time

request = json.loads(sys.stdin.readline())
script = json.loads(open(sys.argv[1]).read())
for step in script.get(request["term"], script.get("*", [])):
    if "sleep" in step:
        time.sleep(step["sleep"])
    elif "die" in step:
        os._exit(1)
    elif "raw" in step:
        print(step["raw"], flush=True)
    elif "echo_request" in step:
        print(json.dumps({"event": "answer", "content": json.dumps(request)}), flush=True)
    else:
        print(json.dumps(step), flush=True)
