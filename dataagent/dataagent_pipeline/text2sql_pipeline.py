from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional

from cot_planning import CotPlanner, ThinkingModelClient, ThinkingModelConfig
from mcp_router import MCPRouter, SQLiteMCPExecutor
from schema_indexing import MilvusSchemaIndexClient, MilvusSchemaIndexConfig
from schema_retrieval.embedding_client import AliyunEmbeddingClient, AliyunEmbeddingConfig
from schema_retrieval.hybrid_schema_retrieval_service import (
    HybridSchemaRetrievalConfig,
    HybridSchemaRetrievalService,
)
from schema_retrieval.keyword_extractor_client import (
    AliyunKeywordExtractor,
    AliyunKeywordExtractorConfig,
)
from schema_retrieval.rerank_client import AliyunRerankClient, AliyunRerankConfig
from schema_retrieval.rrf_fusion_client import RRFFusionConfig
from sql_generation import (
    CoderModelClient,
    CoderModelConfig,
    CotStep,
    LocalSchemaStore,
    SqlGenerator,
)

from .demo_data import create_trade_demo_database, get_trade_business_meta, load_business_meta
from .local_clients import LocalHashEmbeddingClient, SimpleKeywordExtractor
from .objects import PipelineConfig, PipelineResult, StepExecutionLog
from .result_quality import summarize_step_logs, verify_step_logs


class DataAgentText2SQLPipeline:
    """
    DataAgent Text2SQL 端到端流程。

    完整链路串联：
    1. 加载已配置数据库和 Schema 元数据
    2. Schema 检索与 SchemaGraph 构建
    3. CoT 四元组规划
    4. SQL 生成
    5. SQL 治理与数据库路由执行
    6. 有限纠错、执行完整性校验和自然语言总结
    """

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        self.db_path = self._prepare_database()
        self.business_meta = self._load_business_meta()
        self.keyword_extractor = (
            SimpleKeywordExtractor()
            if self.config.allow_mock
            else AliyunKeywordExtractor(AliyunKeywordExtractorConfig())
        )

        self.schema_retrieval_service = self._build_schema_retrieval_service()
        self.cot_planner = self._build_cot_planner()
        self.mcp_router = self._build_mcp_router()
        self.coder_client = CoderModelClient(
            CoderModelConfig(use_mock_when_no_api_key=self.config.allow_mock)
        )

    def run(
        self,
        query: str,
        keywords: Optional[List[str]] = None,
    ) -> PipelineResult:
        """
        执行完整 Text2SQL 流程。
        """
        resolved_keywords = keywords or self.keyword_extractor.extract(query)

        retrieval_result = self.schema_retrieval_service.retrieve(
            query=query,
            keywords=resolved_keywords,
        )

        schema_graph = retrieval_result.schema_graph
        schema_context = schema_graph.to_prompt_context()

        cot_result = self.cot_planner.plan(
            user_query=query,
            schema_graph=schema_graph,
        )

        schema_store = LocalSchemaStore.from_schema_graph(schema_graph)

        sql_generator = SqlGenerator(
            schema_store=schema_store,
            coder_client=self.coder_client,
        )

        step_logs: List[StepExecutionLog] = []

        if not cot_result.steps:
            raise ValueError("查询规划未生成可执行步骤。")

        for cot_step in cot_result.steps:
            sql_cot_step = CotStep(
                database=cot_step.database,
                processing_objects=cot_step.processing_objects,
                operation_instruction=cot_step.operation_instruction,
                output_target=cot_step.output_target,
            )

            local_schema = schema_store.extract_local_schema(sql_cot_step)
            sql_result = sql_generator.generate(sql_cot_step)
            attempts = []
            execution_result = None
            for attempt in range(self.config.max_repair_attempts + 1):
                execution_request = sql_result.to_execution_request()
                execution_result = self.mcp_router.execute(execution_request)
                attempts.append(
                    {
                        "attempt": attempt + 1,
                        "sql": sql_result.sql,
                        "success": execution_result.success,
                        "error": execution_result.error,
                    }
                )
                if execution_result.success:
                    break
                if self.config.allow_mock or attempt >= self.config.max_repair_attempts:
                    break
                sql_result = sql_generator.repair(
                    sql_cot_step,
                    sql_result.sql,
                    execution_result.error or "未知数据库错误",
                )

            assert execution_result is not None

            step_logs.append(
                StepExecutionLog(
                    database=sql_cot_step.database,
                    cot_step=sql_cot_step,
                    local_schema=local_schema.to_prompt_context(),
                    sql=sql_result.sql,
                    execution_request=execution_request,
                    execution_result=execution_result.to_dict(),
                    attempts=attempts,
                )
            )

        verification = verify_step_logs(step_logs)
        answer = summarize_step_logs(query, step_logs, verification)

        return PipelineResult(
            query=query,
            keywords=resolved_keywords,
            schema_context=schema_context,
            cot_output=cot_result.raw_output,
            step_logs=step_logs,
            answer=answer,
            verification=verification,
        )

    def _build_schema_retrieval_service(self) -> HybridSchemaRetrievalService:
        """
        构建 Schema 检索服务。
        """
        embedding_client = (
            LocalHashEmbeddingClient(dimensions=self.config.embedding_dimensions)
            if self.config.allow_mock
            else AliyunEmbeddingClient(
                AliyunEmbeddingConfig(dimensions=self.config.embedding_dimensions)
            )
        )
        rerank_client = AliyunRerankClient(
            AliyunRerankConfig(
                model="qwen3-rerank",
                use_mock_when_unconfigured=self.config.allow_mock,
            )
        )

        milvus_uri = self.config.milvus_uri
        if milvus_uri is None:
            milvus_uri = self.db_path.parent / "schema_index.db"
        if not str(milvus_uri).startswith(("http://", "https://")):
            milvus_uri = str(Path(milvus_uri).resolve())
        collection_prefix = re.sub(r"[^a-zA-Z0-9_]", "_", self.config.database_name)
        if not collection_prefix or collection_prefix[0].isdigit():
            collection_prefix = f"db_{collection_prefix}"
        self.milvus_client = MilvusSchemaIndexClient(
            MilvusSchemaIndexConfig(
                uri=str(milvus_uri),
                token=self.config.milvus_token,
                field_collection_name=f"{collection_prefix}_schema_fields",
                relation_collection_name=f"{collection_prefix}_schema_relations",
                embedding_dim=self.config.embedding_dimensions,
                recreate_collection=True,
            )
        )

        try:
            return HybridSchemaRetrievalService.from_sqlite(
                db_path=self.db_path,
                database_name=self.config.database_name,
                business_meta=self.business_meta,
                embedding_client=embedding_client,
                rerank_client=rerank_client,
                milvus_client=self.milvus_client,
                keyword_extractor=None,
                config=HybridSchemaRetrievalConfig(
                    per_keyword_top_k=20,
                    include_join_columns=True,
                    rrf_config=RRFFusionConfig(
                        rrf_k=60,
                        truncate_multiplier=6,
                        min_fused_top_k=10,
                        max_fused_top_k=50,
                        final_top_k=20,
                        route_weights={
                            "keyword": 1.0,
                            "vector": 1.0,
                        },
                    ),
                    rerank_top_multiplier=2,
                    rerank_min_top_n=2,
                    rerank_max_top_n=20,
                ),
                sample_size=self.config.sample_size,
            )
        except Exception:
            try:
                self.milvus_client.close()
            except Exception:
                pass
            raise

    def _build_cot_planner(self) -> CotPlanner:
        """
        构建 CoT 规划器。
        """
        return CotPlanner(
            thinking_client=ThinkingModelClient(
                ThinkingModelConfig(
                    use_mock_when_no_api_key=self.config.allow_mock,
                    temperature=0.0,
                )
            )
        )

    def _build_mcp_router(self) -> MCPRouter:
        """
        构建 MCP 路由器。
        """
        router = MCPRouter()

        allowed_tables = set(self.config.allowed_tables)
        if not allowed_tables:
            allowed_tables = set(self.schema_retrieval_service.tables)

        router.register_executor(
            database=self.config.database_name,
            executor=SQLiteMCPExecutor(
                database=self.config.database_name,
                db_path=self.db_path,
                readonly=True,
                allowed_tables=allowed_tables,
            ),
        )

        return router

    def _prepare_database(self) -> Path:
        db_path = Path(self.config.db_path).resolve()
        if self.config.initialize_demo:
            return create_trade_demo_database(db_path)
        if not db_path.is_file():
            raise FileNotFoundError(
                f"数据库文件不存在：{db_path}。"
                "如需样例数据，请显式启用 initialize_demo。"
            )
        return db_path

    def _load_business_meta(self) -> dict:
        if self.config.business_meta_path is not None:
            return load_business_meta(self.config.business_meta_path)
        return get_trade_business_meta() if self.config.initialize_demo else {}

    def health(self) -> dict[str, object]:
        errors: dict[str, str] = {}
        try:
            mcp_result = self.mcp_router.execute(
                {"database": self.config.database_name, "sql": "SELECT 1 AS ready;"}
            )
            tools = self.mcp_router.list_tools()
            mcp_ready = mcp_result.success and "execute_readonly_sql" in tools
            if not mcp_ready:
                errors["mcp"] = mcp_result.error or "required tool unavailable"
        except Exception as exc:
            tools = []
            mcp_ready = False
            errors["mcp"] = str(exc)
        try:
            vector_ready = self.milvus_client.health()
            if not vector_ready:
                errors["milvus"] = "collections unavailable"
        except Exception as exc:
            vector_ready = False
            errors["milvus"] = str(exc)
        ready = (
            self.db_path.is_file()
            and bool(self.schema_retrieval_service.documents)
            and vector_ready
            and mcp_ready
        )
        return {
            "status": "ok" if ready else "unavailable",
            "database": self.config.database_name,
            "schema_fields": len(self.schema_retrieval_service.documents),
            "vector_store": "milvus",
            "vector_store_ready": vector_ready,
            "mcp_tools": tools,
            "mcp_ready": mcp_ready,
            "mock_mode": self.config.allow_mock,
            "errors": errors,
        }

    def close(self) -> None:
        self.schema_retrieval_service.close()

    def __enter__(self) -> "DataAgentText2SQLPipeline":
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.close()
