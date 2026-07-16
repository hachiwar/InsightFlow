from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .objects import PipelineConfig
from .text2sql_pipeline import AskDataText2SQLPipeline


class AskDataHandler(BaseHTTPRequestHandler):
    pipeline: AskDataText2SQLPipeline

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok"})
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/query":
            self._json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            query = str(body.get("query", "")).strip()
            if not query:
                self._json(400, {"error": "query_required"})
                return
            self._json(200, self.pipeline.run(query).to_dict())
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
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--db", default="runtime_data/trade_demo.db")
    args = parser.parse_args()

    AskDataHandler.pipeline = AskDataText2SQLPipeline(
        PipelineConfig(db_path=Path(args.db))
    )
    server = ThreadingHTTPServer((args.host, args.port), AskDataHandler)
    print(f"AskData API listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
