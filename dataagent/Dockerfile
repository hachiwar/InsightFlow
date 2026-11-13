FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-runtime.txt ./
RUN pip install --no-cache-dir --requirement requirements-runtime.txt

COPY . .

RUN python -c "import dataagent_pipeline.http_server"

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/runtime_data \
    && chown -R appuser:appuser /app/runtime_data

USER appuser

EXPOSE 8090

CMD ["python", "-m", "dataagent_pipeline.http_server"]
