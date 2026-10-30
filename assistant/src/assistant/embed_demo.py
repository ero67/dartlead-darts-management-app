# Phase 2, step 3: see what embeddings are and how similarity between them behaves.
import math

from assistant.ingest import embeddings, load_chunks


def cosine(a: list[float], b: list[float]) -> float:
    # 1.0 = same direction (same meaning), around 0 = unrelated.
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def main() -> None:
    vector = embeddings.embed_query("bust")
    print(f"'bust' as a vector: {len(vector)} numbers, starting {[round(x, 3) for x in vector[:5]]}\n")

    pairs = [
        ("My score went below zero", "bust"),
        ("bust", "football"),
        ("checkout", "finishing a leg on a double"),
        ("checkout", "paying at the supermarket"),
    ]
    for a, b in pairs:
        va, vb = embeddings.embed_documents([a, b])
        print(f"{cosine(va, vb):.3f}  {a!r} vs {b!r}")

    chunks = load_chunks()
    chunk_vectors = embeddings.embed_documents([c.page_content for c in chunks])
    for question in ["What happens if I end my turn on 1?", "How is MPR calculated?"]:
        q = embeddings.embed_query(question)
        ranked = sorted(zip(chunks, chunk_vectors), key=lambda cv: cosine(q, cv[1]), reverse=True)
        print(f"\nQ: {question}")
        for chunk, v in ranked[:4]:
            print(f"   {cosine(q, v):.3f}  {chunk.metadata['source']} > {chunk.metadata.get('section', '(intro)')}")
