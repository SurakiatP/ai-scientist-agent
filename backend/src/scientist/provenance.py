"""Provenance: how an answer was produced, frozen on the final answer. Allow-lists only: nothing here may carry a secret."""
import hashlib
from datetime import UTC, datetime

from scientist import documents, sandbox, usage
from scientist.config import Settings
from scientist.events import ProvAnalysisSettings, ProvDocFile, ProvDocs, ProvHermes, ProvModels, Provenance, ProvRound, ProvSearch, ProvSettings, Replan, Strategy
from scientist.hermes import SANDBOX_IMAGE, SKILLS_REVISION


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _common(settings: Settings, prompts: dict[str, str], running: str, history_turns: int) -> dict:
    return {"history_turns": history_turns, "created_at": datetime.now(UTC).isoformat(), "app_version": settings.app_version,
            "models": ProvModels(main=settings.model, fallback=settings.fallback_model),
            "prompts": {k: digest(v) for k, v in prompts.items()},
            "phase_seconds": usage.phase_seconds(running), "usage": usage.snapshot()}


def rounds_of(plan: Strategy, replans: list[Replan]) -> list[ProvRound]:
    """Round 1 = the plan as searched; then each re-plan with the terms that came back thin."""
    mk = lambda ss: [ProvSearch(term=s.term, instructions=s.instructions) for s in ss]  # noqa: E731
    return [ProvRound(round=1, searches=mk(plan.searches)),
            *(ProvRound(round=i, searches=mk(r.searches), thin=r.thin) for i, r in enumerate(replans, 2))]


def research(settings: Settings, prompts: dict[str, str], rounds: list[ProvRound], *, given: bool,
             history_turns: int, pack: str | None = None) -> Provenance:
    """prompts: name -> text, only for prompts the run configured and attempted (a failed re-plan or review call still counts).
    settings are the configured values (quick mode runs no re-plan whatever replan_rounds says)."""
    return Provenance(**_common(settings, prompts, "synthesis", history_turns), rounds=rounds,
                      plan_source="given" if given else "strategy", pack=pack,
                      hermes=ProvHermes(revision=settings.hermes_revision, skills_revision=SKILLS_REVISION,
                                        enabled_skills=list(settings.enabled_skills), branch_image=SANDBOX_IMAGE),
                      settings=ProvSettings(**{k: getattr(settings, k) for k in ProvSettings.model_fields}))


def analysis(settings: Settings, prompt: str, data: bytes, pack: str | None = None) -> Provenance:
    return Provenance(**_common(settings, {"analyze": prompt}, "finish", 0), sandbox_image=sandbox.image_for(settings, pack), pack=pack,
                      input_sha256=hashlib.sha256(data).hexdigest(),
                      settings=ProvAnalysisSettings(analyze_max_tokens=settings.analyze_max_tokens))


def docs(settings: Settings, prompt: str, files: list[ProvDocFile], *, passages: int, cited: int, history_turns: int) -> Provenance:
    return Provenance(**_common(settings, {"docs": prompt}, "docs", history_turns),
                      docs=ProvDocs(files=files, top_k=documents.TOP_K, per_doc=documents.PER_DOC, passages=passages, cited=cited))
