from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List


@dataclass
class PipelineConfig:
    """端到端流程配置。"""

    database_name: str = "trade_db"
    db_path: str | Path = "runtime_data/trade_demo.db"
    sample_size: int = 5
    allow_mock: bool = True
    max_repair_attempts: int = 2


@dataclass
class StepExecutionLog:
    """单个 CoT 步骤执行日志。"""

    database: str
    cot_step: object
    local_schema: str
    sql: str
    execution_request: Dict[str, str]
    execution_result: Dict[str, Any]
    attempts: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class PipelineResult:
    """端到端流程结果。"""

    query: str
    keywords: List[str]
    schema_context: str
    cot_output: str
    step_logs: List[StepExecutionLog] = field(default_factory=list)
    answer: str = ""
    verification: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典。"""
        success = self.verification.get("verified") is True
        errors = [
            str(log.execution_result.get("error"))
            for log in self.step_logs
            if log.execution_result.get("error")
        ]
        return {
            "success": success,
            "error": "; ".join(errors) if errors else None,
            "query": self.query,
            "keywords": self.keywords,
            "schema_context": self.schema_context,
            "cot_output": self.cot_output,
            "answer": self.answer,
            "verified": success,
            "verification": self.verification,
            "step_logs": [
                {
                    "database": log.database,
                    "sql": log.sql,
                    "execution_request": log.execution_request,
                    "execution_result": log.execution_result,
                    "attempts": log.attempts,
                }
                for log in self.step_logs
            ],
        }
