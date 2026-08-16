from __future__ import annotations

import math
from typing import Any, Iterable


def verify_step_logs(step_logs: Iterable[object]) -> dict[str, object]:
    checks: list[dict[str, object]] = []
    for index, log in enumerate(step_logs, start=1):
        result = log.execution_result
        rows = result.get("rows") or []
        columns = result.get("columns") or []
        audit = result.get("audit") or {}
        policy = audit.get("policy") or {}
        values_are_finite = all(
            not isinstance(value, float) or math.isfinite(value)
            for row in rows
            for value in row.values()
        )
        step_checks = {
            "step": index,
            "execution_success": result.get("success") is True,
            "row_count_matches": result.get("row_count") == len(rows),
            "columns_match_rows": all(set(row).issubset(columns) for row in rows),
            "numeric_values_are_finite": values_are_finite,
            "sql_policy_verified": policy.get("verified") is True,
        }
        step_checks["verified"] = all(
            value is True for key, value in step_checks.items() if key != "step"
        )
        checks.append(step_checks)

    return {
        "verified": bool(checks) and all(item["verified"] for item in checks),
        "checks": checks,
    }


def summarize_step_logs(
    query: str,
    step_logs: Iterable[object],
    verification: dict[str, object],
) -> str:
    logs = list(step_logs)
    if not verification.get("verified"):
        return f"问题“{query}”未完成可信查询，执行或一致性校验未通过。"

    rows: list[dict[str, Any]] = []
    columns: list[str] = []
    for log in logs:
        result = log.execution_result
        rows.extend(result.get("rows") or [])
        columns.extend(result.get("columns") or [])

    if not rows:
        return f"问题“{query}”查询成功，但在当前数据范围内没有匹配记录。"
    if set(columns) == {"interest_rate"}:
        rates = "、".join(str(row["interest_rate"]) for row in rows[:10])
        return f"问题“{query}”共匹配 {len(rows)} 条记录，年化利率为 {rates}。"

    unique_columns = list(dict.fromkeys(columns))
    return (
        f"问题“{query}”查询并校验通过，共返回 {len(rows)} 行；"
        f"结果字段包括 {', '.join(unique_columns[:8])}。"
    )
