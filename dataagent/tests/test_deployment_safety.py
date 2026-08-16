from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from cot_planning import ThinkingModelClient, ThinkingModelConfig
from dataagent_pipeline import DataAgentText2SQLPipeline, PipelineConfig
from mcp_router import MCPExecutionRequest, SQLiteMCPExecutor


class DeploymentSafetyTest(unittest.TestCase):
    def test_mock_only_accepts_the_documented_demo_question(self) -> None:
        client = ThinkingModelClient(
            ThinkingModelConfig(use_mock_when_no_api_key=True)
        )
        supported = "# 用户Query\n查询总交易笔数大于 50000 的用户利率\n# Schema\n任意"
        self.assertIn("trade_db", client.generate(supported))

        unsupported = "# 用户Query\n查询上月交易总额\n# Schema\ntotal_trade_count interest_rate"
        with self.assertRaisesRegex(ValueError, "只支持"):
            client.generate(unsupported)

    def test_readonly_executor_rejects_writes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "demo.db"
            connection = sqlite3.connect(path)
            try:
                connection.execute("CREATE TABLE items (id INTEGER PRIMARY KEY)")
                connection.commit()
            finally:
                connection.close()

            executor = SQLiteMCPExecutor("demo", path, readonly=True)
            result = executor.execute(
                MCPExecutionRequest(database="demo", sql="DELETE FROM items;")
            )
            self.assertFalse(result.success)
            self.assertFalse(result.audit["policy"]["verified"])

    def test_readonly_executor_enforces_statement_and_table_policy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "demo.db"
            connection = sqlite3.connect(path)
            try:
                connection.execute("CREATE TABLE items (id INTEGER PRIMARY KEY)")
                connection.commit()
            finally:
                connection.close()

            executor = SQLiteMCPExecutor(
                "demo", path, readonly=True, allowed_tables={"items"}
            )
            accepted = executor.execute(
                MCPExecutionRequest(database="demo", sql="SELECT id FROM items;")
            )
            self.assertTrue(accepted.success)
            self.assertTrue(accepted.audit["policy"]["verified"])
            self.assertFalse(
                executor.execute(
                    MCPExecutionRequest(
                        database="demo", sql="SELECT id FROM items; DROP TABLE items;"
                    )
                ).success
            )
            self.assertFalse(
                executor.execute(
                    MCPExecutionRequest(database="demo", sql="SELECT * FROM secrets;")
                ).success
            )

    def test_pipeline_returns_verified_question_aware_answer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pipeline = DataAgentText2SQLPipeline(
                PipelineConfig(db_path=Path(directory) / "trade.db")
            )
            result = pipeline.run("查询总交易笔数大于 50000 的用户利率").to_dict()

        self.assertTrue(result["success"])
        self.assertTrue(result["verified"])
        self.assertIn(result["query"], result["answer"])
        self.assertIn("年化利率", result["answer"])
        self.assertTrue(
            result["step_logs"][0]["execution_result"]["audit"]["policy"]["verified"]
        )


if __name__ == "__main__":
    unittest.main()
