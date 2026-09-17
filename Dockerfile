# syntax=docker/dockerfile:1
# ============================================================
# EduMatch — FastAPI + sentence-transformers + статика (HTML/CSS/JS)
#
# Сборка:   docker build -t edumatch .
# Запуск:   docker run -p 8000:8000 edumatch
# Сайт:     http://localhost:8000
#
# NB: при первой сборке скачиваются ML-модели (~1 ГБ) —
#     они встраиваются в образ, поэтому контейнер стартует
#     сразу и работает без доступа к huggingface.co.
# ============================================================

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TOKENIZERS_PARALLELISM=false \
    HF_HOME=/app/.cache/huggingface

WORKDIR /app

# ---------- Зависимости ----------
# Сначала CPU-сборка PyTorch (без десятков CUDA-пакетов NVIDIA
# это экономит несколько гигабайт), затем остальные зависимости
# из pyproject.toml.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.4" \
 && pip install \
      "fastapi>=0.141.1" \
      "uvicorn[standard]>=0.53.0" \
      "numpy>=2.5.3" \
      "pydantic>=2.13.5" \
      "sentence-transformers>=6.0.1"

# ---------- Кэш ML-моделей на этапе сборки ----------
# Те же модели, что загружаются в main.py (Matcher.__init__).
RUN python - <<'PY'
from sentence_transformers import CrossEncoder, SentenceTransformer

SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
CrossEncoder("cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")
print(">>> ML models cached in image")
PY

# ---------- Код приложения ----------
COPY main.py universities_programs.json ./
COPY *.html ./
COPY css ./css
COPY js ./js
COPY uploads ./uploads

# ---------- Непривилегированный пользователь ----------
RUN useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Приложению нужно время на загрузку моделей и кодирование базы программ,
# поэтому у healthcheck щедрый start-period.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=5 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
