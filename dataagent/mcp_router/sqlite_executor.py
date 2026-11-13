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

    由 MCP 工具调用，只允许执行经过治理的 SELECT / WITH 查询。
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
                self._install_readonly_authorizer(conn)
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

    def _install_readonly_authorizer(self, conn: sqlite3.Connection) -> None:
        allowlist = {table.lower() for table in self.allowed_tables or ()}
        allowed_actions = {sqlite3.SQLITE_SELECT, getattr(sqlite3, "SQLITE_RECURSIVE", -1)}
        blocked_functions = {"load_extension", "writefile", "readfile", "fts3_tokenizer"}

        def authorize(
            action: int,
            arg1: str | None,
            arg2: str | None,
            database: str | None,
            trigger: str | None,
        ) -> int:
            if action == sqlite3.SQLITE_READ:
                table = (arg1 or "").rsplit(".", 1)[-1].lower()
                return sqlite3.SQLITE_OK if not allowlist or table in allowlist else sqlite3.SQLITE_DENY
            if action == sqlite3.SQLITE_FUNCTION:
                function = (arg2 or arg1 or "").lower()
                return sqlite3.SQLITE_DENY if function in blocked_functions else sqlite3.SQLITE_OK
            return sqlite3.SQLITE_OK if action in allowed_actions else sqlite3.SQLITE_DENY

        conn.set_authorizer(authorize)
