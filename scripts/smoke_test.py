from __future__ import annotations

import argparse
import json
import os
import urllib.request


def request_json(
    url: str,
    *,
    method: str = "GET",
    body: dict[str, str] | None = None,
    api_key: str = "",
) -> dict:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    if api_key:
        headers["X-API-Key"] = api_key
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="InsightFlow deployment smoke test")
    parser.add_argument("--base-url", default="http://127.0.0.1")
    parser.add_argument("--api-key", default=os.getenv("ECHOMIND_API_KEY", ""))
    parser.add_argument("--skip-chat", action="store_true")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    health = request_json(f"{base_url}/health")
    if health.get("status") != "ok":
        raise SystemExit(f"Health check failed: {health}")
    print("health: ok")

    if args.skip_chat:
        return
    if not args.api_key:
        parser.error("--api-key or ECHOMIND_API_KEY is required for the chat check")

    chat = request_json(
        f"{base_url}/chat",
        method="POST",
        api_key=args.api_key,
        body={
            "message": "查询总交易笔数大于 50000 的用户利率",
            "user_id": "deployment-smoke-test",
            "conversation_id": "deployment-smoke-test",
        },
    )
    if not chat.get("response") or not chat.get("agent_type"):
        raise SystemExit(f"Chat check failed: {chat}")
    print(f"chat: ok ({chat['agent_type']})")


if __name__ == "__main__":
    main()
