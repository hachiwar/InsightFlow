from __future__ import annotations

import argparse
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .objects import PipelineConfig
from .text2sql_pipeline import AskDataText2SQLPipeline


class AskDataHandler(BaseHTTPRequestHandler):
    pipeline: AskDataText2SQLPipeline
    api_key: str = ""
    max_request_bytes: int = 64 * 1024

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok"})
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/query":
            self._json(404, {"error": "not_found"})
            return
        if self.api_key and not hmac.compare_digest(
            self.headers.get("X-Internal-API-Key", ""),
            self.api_key,
        ):
            self._json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                self._json(400, {"error": "request_body_required"})
                return
            if length > self.max_request_bytes:
                self._json(413, {"error": "request_too_large"})
                return
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                self._json(400, {"error": "invalid_request_body"})
                return
            query = str(body.get("query", "")).strip()
            if not query:
                self._json(400, {"error": "query_required"})
                return
            self._json(200, self.pipeline.run(query).to_dict())
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid_json"})
        except Exception as exc:
            self._json(500, {"error": "query_failed", "message": str(exc)})

    def log_message(self, format: str, *args: object) -> None:
        return

    def _json(self, status: int, value: object) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="AskData read-only Text2SQL API")
    parser.add_argument("--host", default=os.getenv("ASKDATA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("ASKDATA_PORT", "8090")))
    parser.add_argument("--db", default=os.getenv("ASKDATA_DB_PATH", "runtime_data/trade_demo.db"))
    parser.add_argument(
        "--allow-mock",
        action="store_true",
        default=os.getenv("ASKDATA_ALLOW_MOCK", "false").lower() in {"1", "true", "yes"},
    )
    args = parser.parse_args()

    AskDataHandler.api_key = os.getenv("ASKDATA_API_KEY", "")
    AskDataHandler.max_request_bytes = int(
        os.getenv("ASKDATA_MAX_REQUEST_BYTES", str(64 * 1024))
    )
    AskDataHandler.pipeline = AskDataText2SQLPipeline(
        PipelineConfig(db_path=Path(args.db), allow_mock=args.allow_mock)
    )
    server = ThreadingHTTPServer((args.host, args.port), AskDataHandler)
    print(f"AskData API listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
