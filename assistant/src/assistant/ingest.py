# Phase 2: turn the Markdown files in docs/ into embedded chunks in Supabase (public.doc_chunks).
import hashlib
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from langchain_classic.embeddings import CacheBackedEmbeddings  # noqa: E402
from langchain_classic.storage import LocalFileStore  # noqa: E402
from langchain_core.documents import Document  # noqa: E402
from langchain_google_genai import GoogleGenerativeAIEmbeddings  # noqa: E402
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter  # noqa: E402
from supabase import create_client  # noqa: E402

DOCS = Path(__file__).parents[2] / "docs"
EMBEDDING_CACHE = Path(__file__).parents[2] / ".cache" / "embeddings"
# Same Google key as the chat model. embed_documents/embed_query pick the matching task type themselves.
embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-2")


def load_chunks(chunk_size: int = 800, chunk_overlap: int = 100) -> list[Document]:
    # First cut at headings, so a chunk never mixes two topics...
    by_heading = MarkdownHeaderTextSplitter([("#", "title"), ("##", "section")], strip_headers=False)
    # ...then cut sections that are still too long (sizes are in characters, not tokens).
    by_size = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks = []
    for path in sorted(DOCS.glob("*.md")):
        for chunk in by_size.split_documents(by_heading.split_text(path.read_text(encoding="utf-8"))):
            # A cut-out piece loses its context: repeat the section heading on continuation pieces
            # of long sections, and the doc title on every piece ("A visit is a bust..." doesn't say X01).
            title, section = chunk.metadata.get("title"), chunk.metadata.get("section")
            if section and not chunk.page_content.startswith("## "):
                chunk.page_content = f"## {section}\n{chunk.page_content}"
            if title and not chunk.page_content.startswith("# "):
                chunk.page_content = f"{title}\n{chunk.page_content}"
            chunk.metadata["source"] = path.name
            chunks.append(chunk)
    return chunks


def to_pgvector(vector: list[float]) -> str:
    # pgvector's text format, which PostgREST passes straight to the vector column.
    return "[" + ",".join(map(str, vector)) + "]"


def index_docs() -> None:
    # Indexing phase: embed every chunk once and store it in Postgres, so questions don't re-embed the docs.
    chunks = load_chunks()
    cache = LocalFileStore(str(EMBEDDING_CACHE))
    cached_before = sum(1 for _ in cache.yield_keys())
    # Each vector is saved under a hash of its chunk's text: unchanged chunks are read from disk and only
    # new or edited ones go to the API. namespace=model so a model switch never reuses another model's vectors.
    cached = CacheBackedEmbeddings.from_bytes_store(embeddings, cache, namespace=embeddings.model, key_encoder="sha256")
    vectors = cached.embed_documents([c.page_content for c in chunks])
    new = sum(1 for _ in cache.yield_keys()) - cached_before

    # Row id = hash of source + text, so an unchanged chunk keeps its row and an edited one gets a new id.
    rows = {
        hashlib.sha256(f"{c.metadata['source']}\n{c.page_content}".encode()).hexdigest():
            {"content": c.page_content, "metadata": c.metadata, "embedding": to_pgvector(v)}
        for c, v in zip(chunks, vectors)
    }
    # Service role key: the only key allowed to write doc_chunks (RLS blocks everyone else).
    db = create_client(os.environ.get("DOCS_SUPABASE_URL", os.environ["SUPABASE_URL"]), os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    # shortcut: select returns at most 1000 rows by default; page through it if the docs ever grow past that.
    existing = {r["id"] for r in db.table("doc_chunks").select("id").execute().data}
    to_insert = [{"id": i, **row} for i, row in rows.items() if i not in existing]
    to_delete = list(existing - rows.keys())
    for start in range(0, len(to_insert), 25):  # batches keep each request small (3072 numbers per row)
        db.table("doc_chunks").insert(to_insert[start:start + 25]).execute()
    if to_delete:
        db.table("doc_chunks").delete().in_("id", to_delete).execute()
    print(f"{len(chunks)} chunks: {new} embedded via the API, {len(chunks) - new} from cache")
    print(f"doc_chunks: {len(to_insert)} inserted, {len(to_delete)} deleted, {len(rows) - len(to_insert)} unchanged")


def main() -> None:
    chunks = load_chunks()
    for i, chunk in enumerate(chunks):
        first_line = chunk.page_content.splitlines()[1] if "\n" in chunk.page_content else chunk.page_content
        print(f"{i:2}  {chunk.metadata['source']:18} {len(chunk.page_content):4} chars  {first_line[:60]}")
    print(f"\n{len(chunks)} chunks from {len({c.metadata['source'] for c in chunks})} files")
    print("\n--- chunk 4, in full ---\n" + chunks[4].page_content)
    print("\nmetadata:", chunks[4].metadata)
