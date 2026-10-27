# Phase 2: turn the Markdown files in docs/ into chunks ready for embedding.
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from langchain_classic.embeddings import CacheBackedEmbeddings  # noqa: E402
from langchain_classic.storage import LocalFileStore  # noqa: E402
from langchain_core.documents import Document  # noqa: E402
from langchain_core.vectorstores import InMemoryVectorStore  # noqa: E402
from langchain_google_genai import GoogleGenerativeAIEmbeddings  # noqa: E402
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter  # noqa: E402

DOCS = Path(__file__).parents[2] / "docs"
# shortcut: a JSON file instead of a database; moves to Supabase pgvector in step 6.
INDEX = Path(__file__).parents[2] / ".cache" / "docs-index.json"
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


def index_docs() -> None:
    # Indexing phase: embed every chunk once and save the vectors, so questions don't re-embed the docs.
    chunks = load_chunks()
    cache = LocalFileStore(str(EMBEDDING_CACHE))
    cached_before = sum(1 for _ in cache.yield_keys())
    # Each vector is saved under a hash of its chunk's text: unchanged chunks are read from disk and only
    # new or edited ones go to the API. namespace=model so a model switch never reuses another model's vectors.
    cached = CacheBackedEmbeddings.from_bytes_store(embeddings, cache, namespace=embeddings.model, key_encoder="sha256")
    store = InMemoryVectorStore.from_documents(chunks, cached)
    INDEX.parent.mkdir(exist_ok=True)
    store.dump(str(INDEX))
    new = sum(1 for _ in cache.yield_keys()) - cached_before
    print(f"Indexed {len(chunks)} chunks: {new} embedded via the API, {len(chunks) - new} from cache")


def main() -> None:
    chunks = load_chunks()
    for i, chunk in enumerate(chunks):
        first_line = chunk.page_content.splitlines()[1] if "\n" in chunk.page_content else chunk.page_content
        print(f"{i:2}  {chunk.metadata['source']:18} {len(chunk.page_content):4} chars  {first_line[:60]}")
    print(f"\n{len(chunks)} chunks from {len({c.metadata['source'] for c in chunks})} files")
    print("\n--- chunk 4, in full ---\n" + chunks[4].page_content)
    print("\nmetadata:", chunks[4].metadata)
