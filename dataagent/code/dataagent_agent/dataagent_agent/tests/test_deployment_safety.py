from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from cot_planning import ThinkingModelClient, ThinkingModelConfig
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


if __name__ == "__main__":
    unittest.main()
