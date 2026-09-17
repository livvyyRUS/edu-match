import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sentence_transformers import CrossEncoder, SentenceTransformer

BASE_DIR = Path(__file__).parent


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("matcher")

BI_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
CROSS_MODEL = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
DATA_PATH = Path(__file__).parent / "universities_programs.json"

SUBJECT_RU = {
    "russian": "русский язык",
    "literature": "литература",
    "math": "математика",
    "informatics": "информатика",
    "physics": "физика",
    "social_studies": "обществознание",
    "history": "история",
    "foreign_language": "иностранный язык",
}
# синонимы для нормализации пользовательского ввода
SUBJECT_ALIASES = {
    "русский": "russian",
    "русский язык": "russian",
    "русс": "russian",
    "литература": "literature",
    "лит-ра": "literature",
    "математика": "math",
    "матан": "math",
    "мат": "math",
    "профильная математика": "math",
    "информатика": "informatics",
    "инфа": "informatics",
    "икт": "informatics",
    "физика": "physics",
    "обществознание": "social_studies",
    "общество": "social_studies",
    "обществознание ": "social_studies",
    "история": "history",
    "английский": "foreign_language",
    "англ": "foreign_language",
    "иностранный": "foreign_language",
    "иностранный язык": "foreign_language",
}
DIRECTION_RU = {
    "it": "IT, программирование, разработка ПО, информационные технологии",
    "math": "математика, анализ данных, машинное обучение",
    "linguistics": "лингвистика, языки, перевод, NLP",
    "management": "менеджмент, маркетинг, бизнес, управление",
    "economics": "экономика, финансы, бизнес-аналитика",
    "law": "юриспруденция, право",
    "humanities": "филология, гуманитарные науки, литература",
    "design": "дизайн, медиа, интерьер",
}


# ---------- Схемы ----------


class Program(BaseModel):
    id: int
    city: str
    university: str
    code: str
    title: str
    description: str
    ege: list[str]
    egeCount: int
    requiredEge: list[str]
    optionalEge: list[str]
    minScore: int | None = None
    budgetPlaces: int
    direction: str
    form: str


class MatchRequest(BaseModel):
    # предмет -> балл (0..100). Ключи могут быть как в БД, так и по-русски — нормализуем.
    ege: dict[str, int] = Field(default_factory=dict)
    hobbies: list[str] = Field(default_factory=list)
    city: str | None = None
    university: str | None = None
    top_k: int = 5
    # ранжирование
    allow_missing_required: bool = False
    min_avg_score: float | None = Field(
        default=None,
        description="Нижняя граница среднего балла пользователя — программы ниже отсекаются",
    )
    # веса (будут нормализованы)
    w_semantic: float = 0.45
    w_ege_coverage: float = 0.30
    w_ege_scores: float = 0.25
    # ре-ранкинг
    use_reranker: bool = True
    rerank_pool: int = 20

    @field_validator("ege")
    @classmethod
    def _normalize_subjects(cls, v: dict[str, int]) -> dict[str, int]:
        out: dict[str, int] = {}
        for k, score in v.items():
            key = k.strip().lower()
            key = SUBJECT_ALIASES.get(key, key)
            if key in SUBJECT_RU:
                out[key] = int(score)
        return out


class MatchResult(BaseModel):
    program: Program
    score: float
    semantic_score: float
    ege_coverage: float
    ege_scores: float
    rerank_score: float | None = None
    user_total: int
    score_margin: int | None = None  # user_total - minScore, если minScore задан
    missing_required: list[str]


# ---------- Ядро ----------


class Matcher:
    def __init__(self, data_path: Path, bi_model: str, cross_model: str):
        logger.info("Loading bi-encoder %s ...", bi_model)
        self.bi = SentenceTransformer(bi_model)
        logger.info("Loading cross-encoder %s ...", cross_model)
        self.cross = CrossEncoder(cross_model, max_length=512)

        self.programs: list[Program] = self._load(data_path)
        self.program_texts = [self._program_text(p) for p in self.programs]
        logger.info("Encoding %d programs ...", len(self.programs))
        self.embeddings = self.bi.encode(
            self.program_texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        logger.info("Matcher ready.")

    @staticmethod
    def _load(path: Path) -> list[Program]:
        with path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
        return [Program(**item) for item in raw]

    @staticmethod
    def _program_text(p: Program) -> str:
        return ". ".join(
            [
                p.title,
                DIRECTION_RU.get(p.direction, p.direction),
                "Предметы ЕГЭ: " + ", ".join(SUBJECT_RU.get(e, e) for e in p.ege),
                p.description,
            ]
        )

    @staticmethod
    def _query_text(req: MatchRequest) -> str:
        parts: list[str] = []
        if req.ege:
            parts.append("Мои ЕГЭ: " + ", ".join(SUBJECT_RU.get(k, k) for k in req.ege))
        if req.hobbies:
            parts.append("Интересы: " + ", ".join(req.hobbies))
        if req.city:
            parts.append(f"Город: {req.city}")
        if req.university:
            parts.append(f"Вуз: {req.university}")
        return ". ".join(parts)

    # --- ЕГЭ-компоненты ---

    @staticmethod
    def _ege_coverage(user_ege: dict[str, int], program: Program) -> float:
        """Насколько набор предметов юзера соответствует требованиям программы (0..1)."""
        if not program.ege:
            return 0.5  # программа без ЕГЭ — нейтрально
        if not user_ege:
            return 0.0
        req = set(program.requiredEge)
        opt = set(program.optionalEge)
        user = set(user_ege.keys())
        req_hit = len(req & user) / len(req) if req else 1.0
        opt_hit = len(opt & user) / len(opt) if opt else 0.0
        return 0.75 * req_hit + 0.25 * opt_hit

    @staticmethod
    def _ege_scores(user_ege: dict[str, int], program: Program) -> float:
        """Близость баллов пользователя к проходному порогу."""
        if not any(subject in user_ege for subject in program.ege):
            return 0.0

        if program.minScore is None or program.minScore <= 0:
            return 0.0  # Нет данных для оценки близости.

        user_total = Matcher._user_total_for(program, user_ege)
        margin = user_total - program.minScore

        # Максимум на пороге; большой запас не даёт преимущества.
        return float(np.exp(-abs(margin) / 20.0))

    @staticmethod
    def _user_total_for(program: Program, user_ege: dict[str, int]) -> int:
        """
        Приблизительная сумма баллов юзера под программу:
        берём required + лучшие optional до egeCount.
        """
        needed = program.egeCount or len(program.requiredEge) or len(program.ege)
        picked = [s for s in program.requiredEge if s in user_ege]
        rest = sorted(
            (user_ege[s] for s in program.optionalEge if s in user_ege),
            reverse=True,
        )
        for v in rest:
            if len(picked) >= needed:
                break
            picked.append(v)  # type: ignore
        # picked может содержать ключи и значения — считаем сумму по значениям
        total = 0
        used_keys = set()
        for s in program.requiredEge:
            if s in user_ege:
                total += user_ege[s]
                used_keys.add(s)
        for s in sorted(
            (k for k in program.optionalEge if k in user_ege),
            key=lambda k: user_ege[k],
            reverse=True,
        ):
            if len(used_keys) >= needed:
                break
            total += user_ege[s]
            used_keys.add(s)
        return total

    @staticmethod
    def _missing_required(user_ege: dict[str, int], program: Program) -> list[str]:
        return [s for s in program.requiredEge if s not in user_ege]

    # --- Основной поиск ---

    def search(self, req: MatchRequest) -> list[MatchResult]:
        # нормализуем веса
        w_sum = req.w_semantic + req.w_ege_coverage + req.w_ege_scores
        if w_sum <= 0:
            raise HTTPException(400, "Сумма весов должна быть > 0")
        w_sem = req.w_semantic / w_sum
        w_cov = req.w_ege_coverage / w_sum
        w_scr = req.w_ege_scores / w_sum

        user_ege = req.ege
        user_avg = (sum(user_ege.values()) / len(user_ege)) if user_ege else None
        if (
            req.min_avg_score is not None
            and user_avg is not None
            and user_avg < req.min_avg_score
        ):
            # юзер сам себя ограничил — всё равно продолжаем, но помечаем, что фильтр по avg
            pass

        query_text = self._query_text(req)

        # --- Шаг 1: bi-encoder ---
        if query_text:
            q_vec = self.bi.encode(
                [query_text], normalize_embeddings=True, convert_to_numpy=True
            )[0]
            sims = (self.embeddings @ q_vec + 1.0) / 2.0
        else:
            sims = np.full(len(self.programs), 0.0, dtype=np.float32)

        candidates: list[MatchResult] = []
        for idx, program in enumerate(self.programs):
            if req.city and program.city.lower() != req.city.lower():
                continue
            if (
                req.university
                and req.university.lower() not in program.university.lower()
            ):
                continue

            missing = self._missing_required(user_ege, program)
            if missing and not req.allow_missing_required:
                continue

            coverage = self._ege_coverage(user_ege, program)
            scores = self._ege_scores(user_ege, program)
            sem = float(sims[idx])

            total = w_sem * sem + w_cov * coverage + w_scr * scores
            if missing:
                total *= 0.5  # штраф за недостающие обязательные

            user_total = self._user_total_for(program, user_ege)
            margin: int | None = None
            if program.minScore is not None:
                margin = user_total - program.minScore
                # мягкий штраф за недобор (не отсекаем жёстко — юзер сам решит)
                if margin < 0:
                    total *= max(0.35, 1.0 + margin / 100.0)

            # фильтр по среднему баллу, если задан
            if (
                req.min_avg_score is not None
                and user_avg is not None
                and user_avg < req.min_avg_score
            ):
                continue

            candidates.append(
                MatchResult(
                    program=program,
                    score=round(float(total), 4),
                    semantic_score=round(sem, 4),
                    ege_coverage=round(coverage, 4),
                    ege_scores=round(scores, 4),
                    user_total=user_total,
                    score_margin=margin,
                    missing_required=missing,
                )
            )

        # --- Шаг 2: ре-ранкинг top-N через cross-encoder ---
        if req.use_reranker and query_text and candidates:
            candidates.sort(key=lambda r: r.score, reverse=True)
            pool = candidates[: max(req.rerank_pool, req.top_k)]
            pairs = [(query_text, self.program_texts[r.program.id - 1]) for r in pool]
            ce_scores = self.cross.predict(pairs)
            ce_norm = 1.0 / (1.0 + np.exp(-ce_scores))  # sigmoid -> 0..1

            for r, ce in zip(pool, ce_norm):
                r.rerank_score = round(float(ce), 4)
                # смешиваем: 60% финального скора + 40% cross-encoder
                r.score = round(0.6 * r.score + 0.4 * float(ce), 4)
            pool.sort(key=lambda r: r.score, reverse=True)
            return pool[: req.top_k]

        candidates.sort(key=lambda r: r.score, reverse=True)
        return candidates[: req.top_k]


# ---------- FastAPI ----------

app = FastAPI(title="HSE NN Bachelor Program Matcher", version="2.0.0")
matcher: Matcher | None = None


@app.on_event("startup")
def _startup() -> None:
    global matcher
    matcher = Matcher(DATA_PATH, BI_MODEL, CROSS_MODEL)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "programs": len(matcher.programs) if matcher else 0}


@app.get("/match", response_model=list[MatchResult])
def match(
    ege: Optional[str] = Query(None, description="math:92,russian:88,..."),
    hobbies: Optional[str] = Query(None, description="python,ML,..."),
    city: Optional[str] = None,
    university: Optional[str] = None,
    top_k: int = 5,
    w_semantic: float = 0.45,
    w_ege_coverage: float = 0.30,
    w_ege_scores: float = 0.25,
    use_reranker: bool = True,
    allow_missing_required: bool = False,
    rerank_pool: int = 20,
):
    if matcher is None:
        raise HTTPException(503, "Matcher is not ready")

    ege_dict: dict[str, int] = {}
    if ege:
        for pair in ege.split(","):
            if ":" in pair:
                k, v = pair.split(":", 1)
                try:
                    ege_dict[k.strip()] = int(v)
                except ValueError:
                    pass

    hobby_list = [h.strip() for h in (hobbies or "").split(",") if h.strip()]

    return matcher.search(
        MatchRequest(
            ege=ege_dict,
            hobbies=hobby_list,
            city=city,
            university=university,
            top_k=top_k,
            w_semantic=w_semantic,
            w_ege_coverage=w_ege_coverage,
            w_ege_scores=w_ege_scores,
            use_reranker=use_reranker,
            allow_missing_required=allow_missing_required,
            rerank_pool=rerank_pool,
        )
    )


# ---------- Статика и HTML-страницы (чистые URL без .html) ----------

def _rewrite_links(content: str) -> str:
    """
    Переписывает старые ссылки вида *.html на чистые URL без расширения,
    чтобы в адресной строке не было видно index.html / assistant.html и т.п.,
    и чтобы логотип вёл на / вместо index.html.
    Работает без редактирования файлов на диске — подмена на лету.
    """
    # Точные замены для href/action — покрывают все шаблоны из html/
    replacements = [
        # index -> /
        ('href="index.html"', 'href="/"'),
        ("href='index.html'", "href='/'"),
        ('href="./index.html"', 'href="/"'),
        ("href='./index.html'", "href='/'"),
        ('href="/index.html"', 'href="/"'),
        ("href='/index.html'", "href='/'"),
        ('href="html/index.html"', 'href="/"'),
        # assistant
        ('href="assistant.html"', 'href="/assistant"'),
        ("href='assistant.html'", "href='/assistant'"),
        ('href="./assistant.html"', 'href="/assistant"'),
        ("href='./assistant.html'", "href='/assistant'"),
        ('href="/assistant.html"', 'href="/assistant"'),
        ("href='/assistant.html'", "href='/assistant'"),
        # programs
        ('href="programs.html"', 'href="/programs"'),
        ("href='programs.html'", "href='/programs'"),
        ('href="./programs.html"', 'href="/programs"'),
        ("href='./programs.html'", "href='/programs'"),
        ('href="/programs.html"', 'href="/programs"'),
        ("href='/programs.html'", "href='/programs'"),
        # roadmap
        ('href="roadmap.html"', 'href="/roadmap"'),
        ("href='roadmap.html'", "href='/roadmap'"),
        ('href="./roadmap.html"', 'href="/roadmap"'),
        ("href='./roadmap.html'", "href='/roadmap'"),
        ('href="/roadmap.html"', 'href="/roadmap"'),
        ("href='/roadmap.html'", "href='/roadmap'"),
        # action для формы поиска
        ('action="programs.html"', 'action="/programs"'),
        ("action='programs.html'", "action='/programs'"),
        ('action="./programs.html"', 'action="/programs"'),
        ("action='/programs.html'", "action='/programs'"),
        ('action="/programs.html"', 'action="/programs"'),
        ('action="index.html"', 'action="/"'),
        ('action="assistant.html"', 'action="/assistant"'),
        ('action="roadmap.html"', 'action="/roadmap"'),
    ]
    for old, new in replacements:
        content = content.replace(old, new)

    # Дополнительно чистим JS-вставки типа <a href="roadmap.html"> внутри assistant.js
    # (безопасно, т.к. в JS файлах такие строки — только ссылки)
    content = content.replace('"assistant.html"', '"/assistant"')
    content = content.replace("'assistant.html'", "'/assistant'")
    content = content.replace('"programs.html"', '"/programs"')
    content = content.replace("'programs.html'", "'/programs'")
    content = content.replace('"roadmap.html"', '"/roadmap"')
    content = content.replace("'roadmap.html'", "'/roadmap'")
    content = content.replace('"index.html"', '"/"')
    content = content.replace("'index.html'", "'/'")

    return content


def _html_response(name: str) -> Response:
    """Отдать HTML-файл с переписанными ссылками на чистые URL."""
    path = BASE_DIR / name
    if not path.is_file():
        raise HTTPException(404, f"{name} not found")
    raw = path.read_text(encoding="utf-8")
    cleaned = _rewrite_links(raw)
    return Response(content=cleaned, media_type="text/html; charset=utf-8")


def _js_response(file_path: str) -> Response:
    """Отдать JS-файл с переписанными ссылками (если в JS есть .html)."""
    base_js = BASE_DIR / "js"
    # защита от path traversal
    target = (base_js / file_path).resolve()
    if not str(target).startswith(str(base_js.resolve())):
        raise HTTPException(403, "Forbidden")
    if not target.is_file():
        raise HTTPException(404, f"{file_path} not found")
    raw = target.read_text(encoding="utf-8")
    cleaned = _rewrite_links(raw)
    return Response(content=cleaned, media_type="application/javascript; charset=utf-8")


# --- API для JSON-программ (новый каноничный путь) ---
@app.get("/api/programs", response_model=list[Program], tags=["api"])
def list_programs_api() -> list[Program]:
    if matcher is None:
        raise HTTPException(503, "Matcher is not ready")
    return matcher.programs


# --- Чистые HTML-маршруты ---
@app.get("/", include_in_schema=False)
def index():
    return _html_response("html/index.html")


@app.get("/assistant", include_in_schema=False)
def assistant_page_clean():
    return _html_response("html/assistant.html")


@app.get("/roadmap", include_in_schema=False)
def roadmap_page_clean():
    return _html_response("html/roadmap.html")


@app.get("/programs", include_in_schema=False)
def programs_page_or_api(request: Request):
    """
    /programs — теперь отдаёт HTML-страницу каталога для браузеров,
    но сохраняет обратную совместимость: если клиент просит JSON
    (Accept: application/json), возвращаем JSON как раньше.
    """
    accept = request.headers.get("accept", "")
    # Если явно просят JSON (API-клиенты, curl с Accept: application/json, Swagger)
    if "application/json" in accept and "text/html" not in accept:
        if matcher is None:
            raise HTTPException(503, "Matcher is not ready")
        return JSONResponse(content=[p.model_dump() for p in matcher.programs])
    # По умолчанию — HTML с чистыми ссылками
    return _html_response("html/programs.html")


# Для обратной совместимости старый /programs API тоже работает,
# когда запрашивается через /api/programs выше, а /programs с JSON Accept
# уже покрыт. Дублирующий маршрут для /programs как API оставляем
# под другим именем функции, чтобы не конфликтовать с HTML.
@app.get("/programs.json", include_in_schema=False)
def programs_json_alias():
    if matcher is None:
        raise HTTPException(503, "Matcher is not ready")
    return JSONResponse(content=[p.model_dump() for p in matcher.programs])


# --- JS с очисткой ссылок (должен быть ДО монтирования StaticFiles) ---
@app.get("/js/{file_path:path}", include_in_schema=False)
def serve_js_clean(file_path: str):
    return _js_response(file_path)


# --- Редиректы со старых .html URL на чистые ---
@app.get("/index.html", include_in_schema=False)
def redirect_index_html():
    return RedirectResponse(url="/", status_code=301)


@app.get("/index", include_in_schema=False)
def redirect_index():
    return RedirectResponse(url="/", status_code=301)


@app.get("/assistant.html", include_in_schema=False)
def redirect_assistant_html():
    return RedirectResponse(url="/assistant", status_code=301)


@app.get("/assistant/", include_in_schema=False)
def redirect_assistant_slash():
    return RedirectResponse(url="/assistant", status_code=301)


@app.get("/programs.html", include_in_schema=False)
def redirect_programs_html():
    return RedirectResponse(url="/programs", status_code=301)


@app.get("/programs/", include_in_schema=False)
def redirect_programs_slash():
    return RedirectResponse(url="/programs", status_code=301)


@app.get("/roadmap.html", include_in_schema=False)
def redirect_roadmap_html():
    return RedirectResponse(url="/roadmap", status_code=301)


@app.get("/roadmap/", include_in_schema=False)
def redirect_roadmap_slash():
    return RedirectResponse(url="/roadmap", status_code=301)


# --- Статика (css, uploads) — js уже обслуживается выше с очисткой ---
for _sub in ("css", "uploads"):
    _p = BASE_DIR / _sub
    if _p.is_dir():
        app.mount(f"/{_sub}", StaticFiles(directory=_p), name=_sub)

# Если папка js существует, но мы уже перехватили /js/* маршрутом,
# всё равно монтируем как fallback (на случай бинарных файлов),
# но основной путь уже чистый.
_js_dir = BASE_DIR / "js"
if _js_dir.is_dir():
    # Монтируем под другим именем, чтобы не конфликтовать, но оставим
    # и оригинальный mount как fallback — FastAPI проверит маршруты раньше.
    app.mount("/js", StaticFiles(directory=_js_dir), name="js_fallback")


@app.get("/universities_programs.json", include_in_schema=False)
def serve_programs_json():
    return FileResponse(BASE_DIR / "universities_programs.json")
