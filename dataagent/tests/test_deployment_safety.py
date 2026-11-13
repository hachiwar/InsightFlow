from __future__ import annotations

import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from cot_planning import ThinkingModelClient, ThinkingModelConfig
from dataagent_pipeline import DataAgentText2SQLPipeline, PipelineConfig
from mcp_router import MCPExecutionRequest, MCPRouter, SQLiteMCPExecutor
from schema_retrieval.rerank_client import AliyunRerankClient, AliyunRerankConfig


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
                connection.execute("CREATE TABLE secrets (id INTEGER PRIMARY KEY)")
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
            self.assertFalse(
                executor.execute(
                    MCPExecutionRequest(
                        database="demo",
                        sql="SELECT items.id FROM items, secrets WHERE items.id = secrets.id;",
                    )
                ).success
            )

    def test_official_mcp_protocol_lists_and_calls_database_tool(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "demo.db"
            connection = sqlite3.connect(path)
            try:
                connection.execute("CREATE TABLE items (id INTEGER PRIMARY KEY)")
                connection.execute("INSERT INTO items (id) VALUES (1)")
                connection.commit()
            finally:
                connection.close()

            router = MCPRouter()
            router.register_executor(
                "demo",
                SQLiteMCPExecutor("demo", path, readonly=True, allowed_tables={"items"}),
            )
            self.assertIn("execute_readonly_sql", router.list_tools())
            result = router.execute(
                MCPExecutionRequest(database="demo", sql="SELECT id FROM items;")
            )
            self.assertTrue(result.success)
            self.assertEqual([{"id": 1}], result.rows)

    def test_pipeline_returns_verified_question_aware_answer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with DataAgentText2SQLPipeline(
                PipelineConfig(
                    db_path=Path(directory) / "trade.db",
                    initialize_demo=True,
                    allow_mock=True,
                )
            ) as pipeline:
                result = pipeline.run("查询总交易笔数大于 50000 的用户利率").to_dict()
                health = pipeline.health()
                with patch.object(
                    pipeline.milvus_client,
                    "health",
                    side_effect=RuntimeError("vector unavailable"),
                ):
                    degraded_health = pipeline.health()

        self.assertTrue(result["success"])
        self.assertTrue(result["verified"])
        self.assertEqual("execution_integrity", result["verification"]["scope"])
        self.assertIn(result["query"], result["answer"])
        self.assertIn("年化利率", result["answer"])
        self.assertTrue(
            result["step_logs"][0]["execution_result"]["audit"]["policy"]["verified"]
        )
        self.assertEqual("milvus", health["vector_store"])
        self.assertTrue(health["vector_store_ready"])
        self.assertTrue(health["mcp_ready"])
        self.assertEqual("unavailable", degraded_health["status"])
        self.assertIn("vector unavailable", degraded_health["errors"]["milvus"])

    def test_existing_database_is_never_recreated_without_explicit_demo_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "existing.db"
            connection = sqlite3.connect(path)
            try:
                connection.execute("CREATE TABLE retained (id INTEGER PRIMARY KEY, value TEXT)")
                connection.execute("INSERT INTO retained (value) VALUES ('keep-me')")
                connection.commit()
            finally:
                connection.close()

            with DataAgentText2SQLPipeline(
                PipelineConfig(
                    database_name="existing",
                    db_path=path,
                    initialize_demo=False,
                    milvus_uri=Path(directory) / "vectors.db",
                    allow_mock=True,
                )
            ) as pipeline:
                self.assertEqual("ok", pipeline.health()["status"])

            connection = sqlite3.connect(path)
            try:
                value = connection.execute("SELECT value FROM retained").fetchone()[0]
            finally:
                connection.close()
            self.assertEqual("keep-me", value)

    def test_production_mode_fails_fast_without_model_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ", {"DASHSCOPE_API_KEY": "", "DASHSCOPE_WORKSPACE_ID": ""}
        ):
            with self.assertRaisesRegex(ValueError, "API Key"):
                DataAgentText2SQLPipeline(
                    PipelineConfig(
                        db_path=Path(directory) / "trade.db",
                        initialize_demo=True,
                        allow_mock=False,
                    )
                )

    def test_production_rerank_accepts_explicit_service_url(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "DASHSCOPE_API_KEY": "test-key",
                "DASHSCOPE_WORKSPACE_ID": "",
                "DASHSCOPE_RERANK_URL": "https://example.invalid/v1/reranks",
            },
        ):
            client = AliyunRerankClient(
                AliyunRerankConfig(use_mock_when_unconfigured=False)
            )
        self.assertEqual(
            "https://example.invalid/v1/reranks",
            client.config.rerank_url,
        )


if __name__ == "__main__":
    unittest.main()
