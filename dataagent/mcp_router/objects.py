from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class MCPExecutionRequest:
    """
    MCP 执行请求。

    database 用于路由到对应数据库连接。
    sql 是当前步骤生成的 SQL。
    """

    database: str
    sql: str


@dataclass
class MCPExecutionResult:
    """
    MCP 执行结果。
    """

    database: str
    sql: str
    success: bool
    columns: List[str] = field(default_factory=list)
    rows: List[Dict[str, Any]] = field(default_factory=list)
    row_count: int = 0
    truncated: bool = False
    error: Optional[str] = None
    audit: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, value: Dict[str, Any]) -> "MCPExecutionResult":
        """从 MCP 工具的结构化输出恢复执行结果。"""
        return cls(
            database=str(value.get("database", "")),
            sql=str(value.get("sql", "")),
            success=value.get("success") is True,
            columns=[str(item) for item in value.get("columns", [])],
            rows=list(value.get("rows", [])),
            row_count=int(value.get("row_count", 0)),
            truncated=value.get("truncated") is True,
            error=str(value["error"]) if value.get("error") is not None else None,
            audit=dict(value.get("audit", {})),
        )

    def to_dict(self) -> Dict[str, Any]:
        """转换为可序列化字典。"""
        return {
            "database": self.database,
            "sql": self.sql,
            "success": self.success,
            "columns": self.columns,
            "rows": self.rows,
            "row_count": self.row_count,
            "truncated": self.truncated,
            "error": self.error,
            "audit": self.audit,
        }
