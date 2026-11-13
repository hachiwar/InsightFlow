from __future__ import annotations

import asyncio
from typing import Any, Dict

from mcp import Client
from mcp.server import MCPServer

from .objects import MCPExecutionRequest, MCPExecutionResult


class MCPRouter:
    """
    MCP 路由器。

    SQL 生成完成后，根据 execution_request.database
    找到对应数据库执行器，然后执行 SQL。
    """

    def __init__(self):
        self.executors: Dict[str, object] = {}
        self.server = MCPServer(
            "InsightFlow Database Tools",
            instructions="Only expose governed, read-only database query tools.",
        )
        self._register_mcp_tools()

    def _register_mcp_tools(self) -> None:
        @self.server.tool(
            name="execute_readonly_sql",
            description="Execute one governed read-only SQL statement against an authorized database.",
            structured_output=True,
        )
        def execute_readonly_sql(database: str, sql: str) -> dict[str, Any]:
            executor = self.executors.get(database)
            if executor is None:
                return MCPExecutionResult(
                    database=database,
                    sql=sql,
                    success=False,
                    error=f"未找到数据库 {database} 对应的 MCP 执行器。",
                ).to_dict()
            return executor.execute(
                MCPExecutionRequest(database=database, sql=sql)
            ).to_dict()

    def register_executor(self, database: str, executor: object) -> None:
        """
        注册数据库执行器。
        """
        self.executors[database] = executor

    def execute(self, request: MCPExecutionRequest | dict) -> MCPExecutionResult:
        """
        路由并执行请求。
        """
        if isinstance(request, dict):
            request = MCPExecutionRequest(
                database=request["database"],
                sql=request["sql"],
            )

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(self._execute(request))
        raise RuntimeError("MCPRouter.execute 是同步接口，不能在已运行的事件循环中调用。")

    async def _execute(self, request: MCPExecutionRequest) -> MCPExecutionResult:
        try:
            async with Client(self.server, read_timeout_seconds=35) as client:
                discovery = await client.list_tools()
                if not any(tool.name == "execute_readonly_sql" for tool in discovery.tools):
                    raise RuntimeError("MCP 服务未暴露 execute_readonly_sql 工具。")
                result = await client.call_tool(
                    "execute_readonly_sql",
                    {"database": request.database, "sql": request.sql},
                )
            if result.is_error or not isinstance(result.structured_content, dict):
                raise RuntimeError(f"MCP 工具调用失败：{result.content}")
            return MCPExecutionResult.from_dict(result.structured_content)
        except Exception as exc:
            return MCPExecutionResult(
                database=request.database,
                sql=request.sql,
                success=False,
                error=f"MCP 协议调用失败：{exc}",
            )

    def list_tools(self) -> list[str]:
        """通过 MCP 协议返回当前工具列表，用于 readiness 检查。"""
        return asyncio.run(self._list_tools())

    async def _list_tools(self) -> list[str]:
        async with Client(self.server, read_timeout_seconds=5) as client:
            result = await client.list_tools()
        return [tool.name for tool in result.tools]
