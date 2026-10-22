import json
import re
from collections.abc import Awaitable, Callable

from pydantic import BaseModel

from scientist import llm
from scientist.config import Settings, get_settings

# ponytail: keyword rules are a cheap first pass; anything unmatched goes to the small model.
IN_SCOPE = re.compile(
    r"crispr|genom|protein|enzym|cell|gene|dna|rna|chemi|molecul|polymer|perovskite|battery|batteries|"
    r"electrolyte|nano|clinical|trial|cancer|disease|drug|vaccine|medic|llm|language model|transformer|"
    r"neural|deep learning|machine learning|benchmark|pretrain|satellite|geospatial|remote sensing|"
    r"quantum|physics|material|solar|superconduct|semiconductor|engineering|"
    r"พันธุกรรม|จีโนม|โปรตีน|เซลล์|เคมี|โมเลกุล|วัสดุ|นาโน|แบตเตอรี่|มะเร็ง|โรค|วัคซีน|การแพทย์|"
    r"ปัญญาประดิษฐ์|โมเดลภาษา|โมเดล|การเรียนรู้|ดาวเทียม|ควอนตัม|ฟิสิกส์|วิศวกรรม|งานวิจัย|การรู้จำเสียง",
    re.I,
)
OUT_OF_SCOPE = re.compile(
    r"homework|essay|recipe|joke|election|stocks?\b|lottery|horoscope|ignore (all |previous )?instructions|"
    r"write (me )?(some |a )?(react|code|script)|react code|"
    r"การบ้าน|เรียงความ|เขียนโค้ด|ร้านอาหาร|สูตรอาหาร|หวย|หุ้น|เรื่องตลก|ดวง",
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
        r = await llm.complete(system, user, model=settings.fallback_model, max_tokens=60,
                               json_mode=True, settings=settings)
        return r.text

    try:
        d = json.loads(await (ask or default_ask)(SYSTEM, q))
        return ScopeVerdict(in_scope=bool(d["in_scope"]), reason=str(d.get("reason", "")))
    except Exception:  # fail closed: bad JSON, missing key, network, empty completion
        return _no("Scope check could not be completed; question rejected.")
