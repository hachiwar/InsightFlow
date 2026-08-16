from __future__ import annotations

import hashlib
import re
import time
import uuid
from dataclasses import dataclass
from typing import Iterable


WRITE_OR_ADMIN_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|"
    r"reindex|replace|truncate|grant|revoke)\b",
    re.IGNORECASE,
)
DANGEROUS_FUNCTIONS = re.compile(
    r"\b(load_extension|writefile|readfile|fts3_tokenizer)\s*\(",
    re.IGNORECASE,
)
TABLE_REFERENCE = re.compile(
    r"\b(?:from|join)\s+[`\"\[]?([a-zA-Z_][\w.]*)",
    re.IGNORECASE,
)
CTE_NAME = re.compile(
    r"(?:\bwith|,)\s*([a-zA-Z_]\w*)\s+as\s*\(",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SqlValidation:
    statement_type: str
    tables: tuple[str, ...]
    checks: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "verified": True,
            "statement_type": self.statement_type,
            "tables": list(self.tables),
            "checks": list(self.checks),
        }


def validate_readonly_sql(
    sql: str,
    allowed_tables: Iterable[str] | None = None,
    max_sql_length: int = 20_000,
) -> SqlValidation:
    if not sql or not sql.strip():
        raise ValueError("SQL 不能为空。")
    if len(sql) > max_sql_length:
        raise ValueError(f"SQL 长度超过 {max_sql_length} 字符限制。")

    scrubbed = _strip_comments_and_literals(sql)
    statements = [item.strip() for item in scrubbed.split(";") if item.strip()]
    if len(statements) != 1:
        raise ValueError("一次只能执行一条 SQL。")

    normalized = re.sub(r"\s+", " ", statements[0]).strip()
    statement_type = normalized.split(" ", 1)[0].upper()
    if statement_type not in {"SELECT", "WITH"}:
        raise ValueError("只允许执行 SELECT / WITH 查询。")
    if WRITE_OR_ADMIN_SQL.search(normalized):
        raise ValueError("SQL 包含写入、结构变更或管理指令。")
    if DANGEROUS_FUNCTIONS.search(normalized):
        raise ValueError("SQL 调用了不允许的文件或扩展函数。")

    ctes = {name.lower() for name in CTE_NAME.findall(normalized)}
    tables = {
        name.rsplit(".", 1)[-1].lower()
        for name in TABLE_REFERENCE.findall(normalized)
    } - ctes
    allowlist = {name.lower() for name in allowed_tables or ()}
    denied = sorted(tables - allowlist) if allowlist else []
    if denied:
        raise ValueError(f"SQL 访问了未授权数据表：{', '.join(denied)}。")

    checks = ["single_statement", "readonly_statement", "blocked_keywords"]
    if allowlist:
        checks.append("table_allowlist")
    return SqlValidation(statement_type, tuple(sorted(tables)), tuple(checks))


def build_audit_record(
    *,
    database: str,
    sql: str,
    started_at: float,
    success: bool,
    validation: SqlValidation | None = None,
    error: str | None = None,
) -> dict[str, object]:
    return {
        "query_id": uuid.uuid4().hex,
        "database": database,
        "sql_fingerprint": hashlib.sha256(sql.encode("utf-8")).hexdigest()[:16],
        "duration_ms": round((time.monotonic() - started_at) * 1000, 2),
        "success": success,
        "policy": validation.to_dict() if validation else {"verified": False},
        "error": error,
    }


def _strip_comments_and_literals(sql: str) -> str:
    without_comments = re.sub(r"--.*?$", " ", sql, flags=re.MULTILINE)
    without_comments = re.sub(r"/\*[\s\S]*?\*/", " ", without_comments)
    return re.sub(r"'(?:''|[^'])*'", "''", without_comments)
