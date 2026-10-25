import json
import re
from collections.abc import Awaitable, Callable

from pydantic import BaseModel

from scientist import llm
from scientist.config import Settings, get_settings

# ponytail: keyword rules are a cheap first pass; anything unmatched goes to the small model.
# Only strong, distinctive terms let the rules accept alone. Weak/ambiguous words
# (cell, gene, dna, rna, transformer, trial, model, Thai "การเรียนรู้"...) go to the model.
IN_SCOPE = re.compile(
    r"\b(crispr|genomes?|genomics?|proteins?|enzymes?|perovskites?|electrolytes?|llms?|"
    r"language models?|deep learning|machine learning|neural networks?|continual pretraining|"
    r"clinical trials?|remote sensing|geospatial|quantum|superconduct\w*|semiconductors?|"
    r"nanomaterials?|nanoparticles?|polymers?|vaccines?|oncology|cancer)\b|"
    r"พันธุกรรม|จีโนม|โปรตีน|เคมี|โมเลกุล|นาโน|แบตเตอรี่|มะเร็ง|วัคซีน|การแพทย์|"
    r"ปัญญาประดิษฐ์|โมเดลภาษา|ดาวเทียม|ควอนตัม|ฟิสิกส์|การรู้จำเสียง",
    re.I,
)
OUT_OF_SCOPE = re.compile(
    r"\b(homework|essay|recipe|joke|lottery|horoscope|javascript|react (code|component|app|hook)s?|css (class|style|layout)s?|"
    r"python script|js bug|ignore (all |previous )?instructions|write (me )?(some |a )?(code|script))\b|"
    r"การบ้าน|เรียงความ|เขียนโค้ด|ร้านอาหาร|สูตรอาหาร|หวย|เรื่องตลก",
    re.I,
)

SYSTEM = (
    "You judge whether a question is a scientific-research question (life sciences, chemistry, medicine, "
    "ML/AI, physics, materials, engineering, geospatial). Input may be Thai or English. "
    'Reply only JSON: {"in_scope": bool, "reason": "short"}.'
)

Ask = Callable[[str, str], Awaitable[str]]


class ScopeVerdict(BaseModel):
    in_scope: bool
    reason: str


def _no(reason: str) -> ScopeVerdict:
    return ScopeVerdict(in_scope=False, reason=reason)


async def check_scope(question: str, *, settings: Settings, ask: Ask | None = None) -> ScopeVerdict:
    q = question.strip()
    if not q:
        return _no("Question is empty.")
    if len(q) > settings.max_question_chars:
        return _no(f"Question exceeds {settings.max_question_chars} characters.")
    yes, no = IN_SCOPE.search(q), OUT_OF_SCOPE.search(q)
    if yes and not no:
        return ScopeVerdict(in_scope=True, reason="Matches scientific research topics.")
    if no and not yes:
        return _no("Not a scientific research question.")

    async def default_ask(system: str, user: str) -> str:
        r = await llm.complete(system, user, model=settings.fallback_model, max_tokens=settings.guardrail_max_tokens,
                               json_mode=True, settings=settings)
        return r.text

    try:
        d = json.loads(await (ask or default_ask)(SYSTEM, q))
        return ScopeVerdict(in_scope=bool(d["in_scope"]), reason=str(d.get("reason", "")))
    except Exception:  # fail closed: bad JSON, missing key, network, empty completion
        return _no("Scope check could not be completed; question rejected.")
