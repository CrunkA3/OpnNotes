# Search & Indexing

## File-watcher + re-index pipeline (core component)

Because files are truth and there are multiple write paths — web save, REST API,
MCP, direct filesystem edit, and `git pull` — a **file-watcher** monitors the
vault and feeds an idempotent **re-index pipeline**. This component is mandatory
in v1; remote sync and external edits both ride on it.

Pipeline per changed `index.md` (or attachment):

1. **Detect** change (watcher: create / modify / move / delete). Debounce rapid
   saves.
2. **Parse** the markdown (unified/remark) → AST + frontmatter.
3. **Ensure id** — if frontmatter lacks `id`, generate a ULID and write it back to
   the file (the only content mutation the indexer performs).
4. **Extract** title, aliases, tags (frontmatter `tags` + inline `#hashtags`),
   wiki-links, headings.
5. **Resolve links** — map each `[[title]]` to a target `id` via title/alias
   index (nearest-in-tree for duplicates); record unresolved links.
6. **Chunk** the body into passages (heading-aware) for passage-level retrieval.
7. **Embed** each chunk via the `Embeddings` provider (local by default); store
   vectors in `page_chunks`.
8. **Full-text** — update `page_fts.tsv`.
9. **Graph** — recompute this Page's structural edges (links, hierarchy,
   shared-tag) and refresh semantic edges (see
   [knowledge-graph.md](knowledge-graph.md)).
10. **Notify** open clients via WebSocket ("page re-indexed / changed on disk").

Moves/renames update `pages.path` (id unchanged → shares, ACLs, links survive).
Deletes remove cache rows; ACL/share rows for a deleted id are retained until
GC'd (so restoring from git history re-links them).

**Reconciliation with edits in progress:** the indexer respects soft-locks. A
`git pull` or external edit touching a Page that is currently locked for editing
is queued/flagged rather than clobbering the open session (see
[versioning-and-sync.md](versioning-and-sync.md)).

**Full rebuild:** dropping all cache tables and running the pipeline over the whole
vault reconstructs the entire index — the "files are truth" guarantee in practice.

## Search — tiered

### Tier 1 — Hybrid retrieval (default, always available)

- Runs **keyword** (Postgres full-text over `page_fts`) and **semantic**
  (pgvector similarity over `page_chunks`) in parallel.
- Fuse scores (e.g. Reciprocal Rank Fusion) into one ranked list.
- Results are always real Pages/passages, deep-linked to the source. No LLM
  required → fast and cheap.
- Filters: tags, path subtree, updated-date. **ACL-filtered** to what the caller
  may view.

### Tier 2 — Ask (RAG, opt-in)

- Triggered by an explicit "Ask" action / API param / MCP `ask` tool.
- Retrieves passages via Tier 1, then calls the configured **LLM** provider to
  synthesize an answer **with citations** back to source Pages.
- An answer is **derived output, never a note.** Cited Pages are always shown.
- Requires an LLM provider to be configured; otherwise the surface reports "Ask
  unavailable" and only Tier 1 is offered.

## Providers (pluggable)

Two interfaces in `core`, chosen per deployment via config:

```ts
interface Embeddings {
  readonly id: string;          // e.g. "local:bge-small-en"
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

interface LLM {
  readonly id: string;          // e.g. "local:llama3" | "openai:gpt-..."
  answer(input: { question: string; passages: Passage[] }): Promise<{
    text: string;
    citations: { pageId: string; chunkId: string }[];
  }>;
}
```

- **Embeddings: local by default** (e.g. fastembed / transformers.js / Ollama).
  Indexing touches every note, so by default nothing leaves the server.
- **LLM: operator-configurable.** Off by default (Ask disabled); operator may
  point it at a local Ollama model or a bring-your-own-key API. Only invoked on
  explicit Ask.
- Changing the embeddings provider changes vector dimensions → requires a
  re-embed (full rebuild of `page_chunks`). The active provider `id` and
  `dimensions` are recorded so mismatches are detected.

## Non-goals (v1)

- No cross-vault / multi-vault search (single vault per deployment).
- No automatic LLM-generated summaries stored back into notes.
