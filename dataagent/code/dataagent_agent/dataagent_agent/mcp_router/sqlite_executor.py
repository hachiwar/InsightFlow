from __future__ import annotations

import re
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote

from .objects import MCPExecutionRequest, MCPExecutionResult


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
    ):
        self.database = database
        self.db_path = str(db_path)
        self.timeout = timeout
        self.readonly = readonly
        self.max_rows = max_rows

    def execute(self, request: MCPExecutionRequest) -> MCPExecutionResult:
        """
        执行 SQL。
        """
        if request.database != self.database:
            return MCPExecutionResult(
                database=request.database,
                sql=request.sql,
                success=False,
                error=f"数据库路由错误：当前执行器只处理 {self.database}",
            )

        sql = request.sql.strip()

        if self.readonly and not self._is_readonly_sql(sql):
            return MCPExecutionResult(
                database=request.database,
                sql=sql,
                success=False,
                error="只允许执行 SELECT / WITH 查询。",
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
            )

        except Exception as exc:
            return MCPExecutionResult(
                database=request.database,
                sql=sql,
                success=False,
                error=str(exc),
            )
        finally:
            if conn is not None:
                conn.close()

    def _is_readonly_sql(self, sql: str) -> bool:
        """
        判断是否为只读 SQL。
        """
        normalized = re.sub(r"\s+", " ", sql.strip()).lower()
        return normalized.startswith("select ") or normalized.startswith("with ")
