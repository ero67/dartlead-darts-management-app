# The assistant API (POST /chat) for Cloud Run. Build from this folder:
#   docker build -t dartlead-assistant .
# Secrets come from the environment at run time (Cloud Run + Secret Manager), never from the image.
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

WORKDIR /app
# Dependencies first, so code changes reuse this layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY README.md ./
COPY src ./src
RUN uv sync --locked --no-dev

ENV PATH="/app/.venv/bin:$PATH" HOST=0.0.0.0 PORT=8080 PYTHONUNBUFFERED=1
USER nobody
CMD ["serve"]
