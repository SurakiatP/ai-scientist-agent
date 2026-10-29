# ai-scientist-client

Sync Python client for the AI Scientist public API. Needs an API key (`python -m scientist.apikeys create`).

```python
from ai_scientist_client import Client

with Client("https://your-host", "sci_...") as c:
    plan = c.plan("Does base editing cause off-target edits?", mode="quick")   # optional; edit plan.searches
    run = c.research("Does base editing cause off-target edits?", mode="quick", plan=plan.searches)
    for ev in c.events(run.run_id):            # SSE; resume with last_event_id=
        print(ev.type)
    result = c.wait(run.run_id, timeout=600)   # returns last state on timeout; check result.done
    print(result.answer.content if result.answer else result.status)
    print(c.artifact(run.run_id, "bibtex"))
```

Errors raise `ApiError(status, code, message)`. Install: `pip install ./sdk/python`. Tests: `uv run --with httpx --with pytest pytest sdk/python/tests -q`.
