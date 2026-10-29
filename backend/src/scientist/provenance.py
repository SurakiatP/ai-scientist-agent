"""Provenance: how an answer was produced, frozen on the final answer. Allow-lists only: nothing here may carry a secret."""
import hashlib
from datetime import UTC, datetime

from scientist import usage
from scientist.config import Settings
from scientist.events import ProvHermes, ProvModels, Provenance, ProvRound, ProvSearch, ProvSettings, Replan, Strategy
from scientist.hermes import SANDBOX_IMAGE, SKILLS_REVISION


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _common(settings: Settings, prompts: dict[str, str], running: str) -> dict:
    return {"created_at": datetime.now(UTC).isoformat(), "app_version": settings.app_version,
            "models": ProvModels(main=settings.model, fallback=settings.fallback_model),
            "prompts": {k: digest(v) for k, v in prompts.items()},
            "phase_seconds": usage.phase_seconds(running), "usage": usage.snapshot()}


def rounds_of(plan: Strategy, replans: list[Replan]) -> list[ProvRound]:
    """Round 1 = the plan as searched; then each re-plan with the terms that came back thin."""
    mk = lambda ss: [ProvSearch(term=s.term, instructions=s.instructions) for s in ss]  # noqa: E731
    return [ProvRound(round=1, searches=mk(plan.searches)),
            *(ProvRound(round=i, searches=mk(r.searches), thin=r.thin) for i, r in enumerate(replans, 2))]


def research(settings: Settings, prompts: dict[str, str], rounds: list[ProvRound]) -> Provenance:
    """prompts: name -> the exact text sent, only for prompts this run used."""
    return Provenance(**_common(settings, prompts, "synthesis"), rounds=rounds,
                      hermes=ProvHermes(revision=settings.hermes_revision, skills_revision=SKILLS_REVISION,
                                        enabled_skills=list(settings.enabled_skills), branch_image=SANDBOX_IMAGE),
                      settings=ProvSettings(**{k: getattr(settings, k) for k in ProvSettings.model_fields}))


def analysis(settings: Settings, prompt: str) -> Provenance:
    return Provenance(**_common(settings, {"analyze": prompt}, "finish"), sandbox_image=settings.sandbox_image)
