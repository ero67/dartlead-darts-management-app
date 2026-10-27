# Phase 2: measure how chunk size and top-k change retrieval, using the cases in evals/rag_cases.json.
# Retrieval only (no answer model) and in memory (no database writes).
import json
import time
from pathlib import Path

from langchain_classic.embeddings import CacheBackedEmbeddings
from langchain_classic.storage import LocalFileStore

from assistant.embed_demo import cosine
from assistant.ingest import EMBEDDING_CACHE, embeddings, load_chunks

CASES = Path(__file__).parents[2] / "evals" / "rag_cases.json"
SIZES = [300, 800, 1500]
KS = [1, 2, 4, 8]

store = LocalFileStore(str(EMBEDDING_CACHE))
# Query cache on too: the same 15 questions are asked for every chunk size.
cached = CacheBackedEmbeddings.from_bytes_store(
    embeddings, store, namespace=embeddings.model, key_encoder="sha256", query_embedding_cache=True)


def cache_size() -> int:
    return sum(1 for _ in store.yield_keys())


def paced(embed, texts: list[str]) -> list[list[float]]:
    # Free tier: 100 embedding requests a minute. Only uncached texts cost a request, so wait a minute
    # after any batch that actually called the API. The cache keeps finished batches if a run fails.
    vectors = []
    for start in range(0, len(texts), 60):
        before = cache_size()
        vectors += embed(texts[start:start + 60])
        if cache_size() > before:
            time.sleep(61)
    return vectors


def main() -> None:
    cases = [c for c in json.loads(CASES.read_text(encoding="utf-8")) if not c.get("unknown")]
    questions = paced(lambda batch: [cached.embed_query(q) for q in batch], [c["question"] for c in cases])
    print(f"{len(cases)} questions\n")
    print(f"{'size':>5} {'chunks':>6} " + " ".join(f"{'hit@' + str(k):>6}" for k in KS) + "  avg chars in top 4")
    for size in SIZES:
        chunks = load_chunks(chunk_size=size, chunk_overlap=size // 8)
        vectors = paced(cached.embed_documents, [c.page_content for c in chunks])
        ranks, context_chars = [], []
        for case, q in zip(cases, questions):
            ranked = sorted(zip(chunks, vectors), key=lambda cv: cosine(q, cv[1]), reverse=True)
            labels = [f"{c.metadata['source']} > {c.metadata.get('section')}" for c, _ in ranked]
            # Rank of the first chunk from an expected section (1 = top result).
            ranks.append(next((i for i, label in enumerate(labels, 1) if label in case["sections"]), None))
            context_chars.append(sum(len(c.page_content) for c, _ in ranked[:4]))
        hits = " ".join(f"{sum(r is not None and r <= k for r in ranks):>3}/{len(cases):<2}" for k in KS)
        print(f"{size:>5} {len(chunks):>6} {hits}  {sum(context_chars) // len(cases):>6}")
