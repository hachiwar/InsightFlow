from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote

from .objects import MCPExecutionRequest, MCPExecutionResult
from .query_governance import (
    SqlValidation,
    build_audit_record,
    validate_readonly_sql,
)


class SQLiteMCPExecutor:
    """
    SQLite MCP 执行器。

    这里模拟 MCP 路由到数据库 API 后的执行过程。
    为了 Demo 安全，只允许执行 SELECT / WITH 查询。
    """

    def __init__(
        self,
        database: str,
        db_path: str | Path,
        timeout: int = 30,
        readonly: bool = True,
        max_rows: int = 100,
        allowed_tables: set[str] | None = None,
    ):
        self.database = database
        self.db_path = str(db_path)
        self.timeout = timeout
        self.readonly = readonly
        self.max_rows = max_rows
        self.allowed_tables = allowed_tables

    def execute(self, request: MCPExecutionRequest) -> MCPExecutionResult:
        """
        执行 SQL。
        """
        started_at = time.monotonic()
        if request.database != self.database:
            error = f"数据库路由错误：当前执行器只处理 {self.database}"
            return MCPExecutionResult(
                database=request.database,
                sql=request.sql,
                success=False,
                error=error,
                audit=build_audit_record(
                    database=request.database,
                    sql=request.sql,
                    started_at=started_at,
                    success=False,
                    error=error,
                ),
            )

        sql = request.sql.strip()

        validation: SqlValidation | None = None
        if self.readonly:
            try:
                validation = validate_readonly_sql(sql, self.allowed_tables)
            except ValueError as exc:
                error = str(exc)
                return MCPExecutionResult(
                    database=request.database,
                    sql=sql,
                    success=False,
                    error=error,
                    audit=build_audit_record(
                        database=request.database,
                        sql=sql,
                        started_at=started_at,
                        success=False,
                        error=error,
                    ),
                )

        conn: sqlite3.Connection | None = None
        try:
            if self.readonly:
                path = Path(self.db_path).resolve().as_posix()
                target = f"file:{quote(path, safe='/:')}?mode=ro"
                conn = sqlite3.connect(target, timeout=self.timeout, uri=True)
            else:
                conn = sqlite3.connect(self.db_path, timeout=self.timeout)
            conn.row_factory = sqlite3.Row
            if self.readonly:
                conn.execute("PRAGMA query_only = ON")
            deadline = time.monotonic() + self.timeout
            conn.set_progress_handler(
                lambda: 1 if time.monotonic() > deadline else 0,
                1000,
            )

            cursor = conn.execute(sql)
            rows = cursor.fetchmany(self.max_rows + 1)
            truncated = len(rows) > self.max_rows
            rows = rows[:self.max_rows]
            columns = [item[0] for item in cursor.description or []]

            result_rows: List[Dict[str, Any]] = [
                dict(row)
                for row in rows
            ]

            return MCPExecutionResult(
                database=request.database,
                sql=sql,
                success=True,
                columns=columns,
                rows=result_rows,
                row_count=len(result_rows),
                truncated=truncated,
                audit=build_audit_record(
                    database=request.database,
                    sql=sql,
                    started_at=started_at,
                    success=True,
                    validation=validation,
                ),
            )

        except Exception as exc:
            error = str(exc)
            return MCPExecutionResult(
                database=request.database,
                sql=sql,
                success=False,
                error=error,
                audit=build_audit_record(
                    database=request.database,
                    sql=sql,
                    started_at=started_at,
                    success=False,
                    validation=validation,
                    error=error,
                ),
            )
        finally:
            if conn is not None:
                conn.close()
