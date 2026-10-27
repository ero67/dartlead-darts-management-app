# Phase 2: find the doc chunks most relevant to a question (the "R" in RAG), from Supabase pgvector.
import os
import sys

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler
from supabase import create_client

from assistant.ingest import embeddings, to_pgvector  # importing ingest loads .env first

# The public key is enough: RLS lets everyone read doc_chunks and no one but the indexer write.
db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])


class DocChunksRetriever(BaseRetriever):
    """Nearest doc chunks to a question, via the match_doc_chunks SQL function."""

    # k: how many chunks go into the prompt. Too few misses context, too many adds noise and cost.
    k: int = 4
    # e.g. "rules-" to search only the rules docs once the router knows the question is about rules.
    source_prefix: str | None = None

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> list[Document]:
        rows = db.rpc("match_doc_chunks", {
            "query_embedding": to_pgvector(embeddings.embed_query(query)),
            "match_count": self.k,
            "source_prefix": self.source_prefix,
        }).execute().data
        return [Document(r["content"], metadata={**r["metadata"], "similarity": round(r["similarity"], 3)})
                for r in rows]


retriever = DocChunksRetriever()


def main() -> None:
    question = " ".join(sys.argv[1:]) or "What happens if I end my turn on 1?"
    with propagate_attributes(trace_name="search-docs", tags=["phase-2"]):
        chunks = retriever.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "retrieve-chunks"})
    for i, chunk in enumerate(chunks, 1):
        preview = " ".join(chunk.page_content.split("\n")[2:])[:100]
        meta = chunk.metadata
        print(f"{i}. {meta['similarity']:.3f}  {meta['source']} > {meta.get('section', '(intro)')}\n   {preview}...")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
