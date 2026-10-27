# Phase 2: find the doc chunks most relevant to a question (the "R" in RAG).
import sys

from langchain_core.vectorstores import InMemoryVectorStore
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant.ingest import INDEX, embeddings  # importing ingest loads .env first

store = InMemoryVectorStore.load(str(INDEX), embeddings)
# k: how many chunks go into the prompt later. Too few misses context, too many adds noise and cost.
retriever = store.as_retriever(search_kwargs={"k": 4})


def main() -> None:
    question = " ".join(sys.argv[1:]) or "What happens if I end my turn on 1?"
    with propagate_attributes(trace_name="search-docs", tags=["phase-2"]):
        chunks = retriever.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "retrieve-chunks"})
    for i, chunk in enumerate(chunks, 1):
        preview = " ".join(chunk.page_content.split("\n")[2:])[:110]
        print(f"{i}. {chunk.metadata['source']} > {chunk.metadata.get('section', '(intro)')}\n   {preview}...")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
