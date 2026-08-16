FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements-runtime.txt ./
RUN pip install --no-cache-dir --requirement requirements-runtime.txt

COPY . .

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/runtime_data \
    && chown -R appuser:appuser /app/runtime_data

USER appuser

EXPOSE 8090

CMD ["python", "-m", "dataagent_pipeline.http_server", "--host", "0.0.0.0", "--port", "8090", "--db", "/app/runtime_data/trade_demo.db"]
