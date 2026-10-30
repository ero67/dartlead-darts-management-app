-- Knowledge base for the AI assistant (assistant/ in this repo): chunks of the
-- user docs in assistant/docs/ with their embedding vectors, so the assistant
-- can find the sections relevant to a question (retrieval for RAG).
--
-- Rows are written only by the indexing script with the service role key
-- (assistant/src/assistant/ingest.py); there are no insert/update/delete
-- policies, so anon and authenticated users cannot change them. The content is
-- public help text, so everyone may read it.
--
-- 3072 dimensions = gemini-embedding-2. Changing the embedding model means a
-- new column size and a full re-index. No vector index yet: a few hundred rows
-- are compared in under a millisecond, and HNSW on `vector` stops at 2000 dims.
--
-- Not used by the web or Android app. Idempotent: safe to run twice.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.doc_chunks (
  id        text PRIMARY KEY,                      -- hash of source + content, set by the indexer
  content   text NOT NULL,                         -- the chunk text given to the model
  metadata  jsonb NOT NULL DEFAULT '{}'::jsonb,    -- source file, title, section
  embedding extensions.vector(3072) NOT NULL
);

ALTER TABLE public.doc_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doc chunks are readable by everyone" ON public.doc_chunks;
CREATE POLICY "Doc chunks are readable by everyone"
  ON public.doc_chunks FOR SELECT
  TO anon, authenticated
  USING (true);

-- Nearest chunks to a question vector by cosine distance (<=>, smaller is
-- closer). source_prefix narrows the search, e.g. 'rules-' when the router
-- says the question is about rules. SECURITY INVOKER so RLS still applies.
CREATE OR REPLACE FUNCTION public.match_doc_chunks(
  query_embedding extensions.vector(3072),
  match_count int DEFAULT 4,
  source_prefix text DEFAULT NULL
)
  RETURNS TABLE (id text, content text, metadata jsonb, similarity float)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $$
  SELECT c.id, c.content, c.metadata,
         1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.doc_chunks c
  WHERE source_prefix IS NULL OR c.metadata->>'source' LIKE source_prefix || '%'
  ORDER BY c.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_doc_chunks(extensions.vector, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_doc_chunks(extensions.vector, int, text) TO anon, authenticated, service_role;
