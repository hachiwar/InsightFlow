from __future__ import annotations

from typing import List, Tuple

import numpy as np

from .embedding_client import AliyunEmbeddingClient


class VectorIndex:
    """
    内存向量索引。

    当前 Demo 使用 numpy 矩阵保存字段向量，并通过 cosine similarity 完成向量召回。
    生产环境中可以替换为 FAISS、Milvus、PGVector 或 Elasticsearch dense_vector。
    """

    def __init__(self, embedding_client: AliyunEmbeddingClient):
        self.embedding_client = embedding_client
        self.documents: List[str] = []
        self.embeddings: np.ndarray | None = None

    def build(self, documents: List[str]) -> None:
        """
        构建向量索引。

        Args:
            documents: 待索引的字段级向量文本列表。
        """
        self.documents = documents
        self.embeddings = self.embedding_client.embed_texts(documents)

    def search(self, query: str, top_k: int = 5) -> List[Tuple[int, float]]:
        """
        根据 Query 进行向量召回。

        Args:
            query: 用户自然语言查询。
            top_k: 返回的候选数量。

        Returns:
            List[Tuple[int, float]]: 文档下标与相似度得分。
        """
        if self.embeddings is None:
            raise RuntimeError("VectorIndex 尚未构建，请先调用 build()。")

        query_vector = self.embedding_client.embed_texts([query])[0]

        # embeddings 和 query_vector 都已经归一化，点积等价于 cosine similarity。
        scores = self.embeddings @ query_vector

        top_indices = np.argsort(-scores)[:top_k]

        return [
            (int(index), float(scores[index]))
            for index in top_indices
        ]


class MilvusVectorIndex:
    """Milvus 字段向量索引适配器。"""

    def __init__(self, embedding_client, milvus_client, doc_ids: List[str]):
        self.embedding_client = embedding_client
        self.milvus_client = milvus_client
        self.doc_index = {doc_id: index for index, doc_id in enumerate(doc_ids)}

    def search(self, query: str, top_k: int = 5) -> List[Tuple[int, float]]:
        query_vector = self.embedding_client.embed_texts([query])[0].astype(float).tolist()
        hits = self.milvus_client.search_fields(query_vector, top_k=top_k)
        output: List[Tuple[int, float]] = []
        for hit in hits:
            entity = hit.get("entity") or hit
            doc_id = entity.get("doc_id") or hit.get("id")
            if doc_id not in self.doc_index:
                continue
            score = hit.get("distance", hit.get("score", 0.0))
            output.append((self.doc_index[str(doc_id)], float(score)))
        return output
