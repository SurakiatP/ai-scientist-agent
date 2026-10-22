"""Branch bridge: runs one pinned-Hermes agent for one search term, in Hermes's own Python env.

stdin: one JSON request line. stdout: JSON lines, {"event": "paper", "paper": {...}} while running,
and {"event": "rejected", "paper": {ids}, "reason": str} when report_paper refuses a call,
then {"event": "answer", "content": str} or {"event": "failed", "code": str}. See setup.md.
"""
import json
import re
import signal
import sys
import threading
import uuid

WIRE = sys.stdout
LOCK = threading.Lock()
ALLOWED = {"terminal", "skills_list", "skill_view", "report_paper"}
HTTP_URL = re.compile(r"https?://(?:[^\s/?#@]+@)?[^\s/?#@]+[^\s]*", re.I)  # identical to scientist.events
PAPER_SCHEMA = {
    "name": "report_paper",
    "description": "Record one paper you retrieved and will use. Call once per paper, as soon as you have its metadata.",
    "parameters": {"type": "object", "required": ["title", "url"], "properties": {
        "title": {"type": "string"},
        "authors": {"type": "array", "items": {"type": "string"}},
        "year": {"type": "integer"},
        "doi": {"type": "string", "description": "DOI without the https://doi.org/ prefix, if known"},
        "pmid": {"type": "string", "description": "PubMed ID, if known"},
        "url": {"type": "string", "description": "Landing page; https://doi.org/<doi> when nothing better"},
    }},
}


def clean_paper(args):
    """(paper, None) with only the fields given, or (None, error) for the model to fix and retry."""
    if not isinstance(args, dict):
        return None, "arguments must be an object"
    paper = {}
    title, url = args.get("title"), args.get("url")
    if not isinstance(title, str) or not title.strip():
        return None, "title is required"
    if not isinstance(url, str) or not HTTP_URL.fullmatch(url.strip()):
        return None, "url must be an http(s) link, e.g. https://doi.org/<doi>"
    paper["title"], paper["url"] = title.strip(), url.strip()
    authors, year, doi, pmid = (args.get(k) for k in ("authors", "year", "doi", "pmid"))
    if authors is not None:
        if not isinstance(authors, list) or not all(isinstance(a, str) for a in authors):
            return None, "authors must be a list of names"
        paper["authors"] = authors
    if year is not None:
        if not isinstance(year, int) or isinstance(year, bool):
            return None, "year must be an integer"
        paper["year"] = year
    if doi is not None:
        if not isinstance(doi, str):
            return None, "doi must be a string"
        paper["doi"] = doi.strip()
    if pmid is not None:
        if isinstance(pmid, bool) or not isinstance(pmid, (str, int)):
            return None, "pmid must be a string"
        paper["pmid"] = str(pmid).strip()
    return paper, None


def emit(value):
    with LOCK:
        WIRE.write(json.dumps(value, ensure_ascii=False) + "\n")
        WIRE.flush()


def main():
    global WIRE
    WIRE, sys.stdout = sys.stdout, sys.stderr  # Hermes prints; keep the wire clean
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))  # runs the finally below: container cleanup
    request = json.loads(sys.stdin.readline())
    task_id = uuid.uuid4().hex

    import tools.terminal_tool as terminal
    from tools.registry import registry
    from tools.terminal_tool_lifecycle import cleanup_vm

    def report_paper(args, **_):
        paper, error = clean_paper(args)
        if error:  # tell the backend too, so a paper the model never fixes is still counted
            ids = args if isinstance(args, dict) else {}
            emit({"event": "rejected", "reason": error, "paper": {
                k: str(v)[:500] for k in ("doi", "pmid", "title", "url")
                if isinstance(v := ids.get(k), (str, int)) and not isinstance(v, bool)}})
            return json.dumps({"error": f"paper not recorded: {error}. Fix the arguments and call again."})
        emit({"event": "paper", "paper": paper})
        return json.dumps({"recorded": True})

    registry.register(name="report_paper", toolset="scientist", schema=PAPER_SCHEMA, handler=report_paper)
    dispatch = registry.dispatch

    def restricted(name, args, **kwargs):
        if name not in ALLOWED:
            return json.dumps({"error": "unsupported_tool"})
        return dispatch(name, args, **kwargs)

    registry.dispatch = restricted
    from run_agent import AIAgent

    try:
        agent = AIAgent(
            provider="openrouter", base_url=request["base_url"], api_key=request["api_key"], model=request["model"],
            max_iterations=request["max_iterations"], max_tokens=request["max_tokens"],
            run_budget_seconds=request["budget_seconds"], session_id=task_id,
            enabled_toolsets=["terminal", "skills", "scientist"], skip_memory=True, skip_context_files=True,
            skip_background_review=True, quiet_mode=True, save_trajectories=False, verbose_logging=False)
        agent.tools = [t for t in agent.tools if t["function"]["name"] in ALLOWED]
        agent.valid_tool_names = set(ALLOWED)
    except Exception:
        emit({"event": "failed", "code": "native_start_failed"})
        return

    def work():
        try:
            result = agent.run_conversation(
                f"Search term: {request['term']}\n\nWhat to extract: {request['instructions']}",
                task_id=task_id, conversation_history=[], system_message=request["system"])
            content = result.get("final_response") if isinstance(result, dict) else None
            if not isinstance(content, str) or not content.strip() or result.get("failed"):
                emit({"event": "failed", "code": "native_response_invalid"})
            else:
                emit({"event": "answer", "content": content})
        except Exception:
            emit({"event": "failed", "code": "native_execution_failed"})

    # The agent runs on a worker thread: a tool call can block for minutes, and SIGTERM is
    # only handled on the main thread, which therefore stays in short joins.
    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    try:
        while thread.is_alive():
            thread.join(0.5)
    finally:
        if thread.is_alive():
            try:
                agent.interrupt()
            except Exception:
                pass
        environments = list(terminal._active_environments.values())
        cleanup_vm(task_id, force_remove=True)
        for environment in environments:  # removal runs on a thread; wait so exit does not orphan it
            getattr(environment, "wait_for_cleanup", lambda **_: None)(timeout=10)

if __name__ == "__main__":
    main()
