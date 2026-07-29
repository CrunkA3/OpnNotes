# Roadmap — v1 Scope vs. Deferred

## v1 — must-haves

**Foundations**
- Self-hosted, multi-user; local accounts + PATs.
- Content-truth-only model; folder-per-page vault with `index.md`; frontmatter
  `id` (ULID); attachments co-located.
- Wiki-links by title with auto-rewrite on rename; tags from frontmatter + inline
  `#hashtags`.

**Editing & collaboration**
- Milkdown editor (mermaid, math, tables, slash menu, wiki-link/hashtag
  autocomplete, attachment upload).
- Soft-lock + presence.
- Per-page **cascade** sharing (with override): named-user grants + view/edit
  **share links** (edit-link display-name prompt, revocable, optional expiry).

**Knowledge**
- PostgreSQL + pgvector.
- File-watcher + re-index pipeline (the reconciliation backbone).
- Hybrid search (keyword + semantic) default, **and** opt-in RAG "Ask" (LLM
  optional/pluggable; local-default embeddings).
- Structural + semantic knowledge graph; graph view with **edges-on-select** and a
  semantic-edge toggle.

**Interfaces**
- REST + OpenAPI (self-documenting, generated clients).
- Remote MCP (HTTPS + scoped token) — **read and write**, ACL/lock-respecting,
  destructive ops confirmed, audited. Home Assistant–friendly.

**Persistence**
- Git-backed history (auto-commit, editor = git author).
- Optional remote git sync (auto-push / manual or scheduled pull) via the
  file-watcher pipeline.

**Ops**
- Docker Compose (app + Postgres); TLS for public endpoints; audit log; full
  reindex command.

## Explicitly deferred (later)

| Deferred item | Why deferred | Notes |
|---------------|--------------|-------|
| OIDC / SSO | Local accounts cover v1; adds per-deployment external setup | Auth layer abstracted to slot it in |
| Real-time collaborative editing (Yjs CRDT) | Biggest complexity source; two-source-of-truth tension with files | Milkdown keeps the door open without editor change |
| LLM entity/concept extraction graph layer | Non-deterministic; breaks files-are-truth | Structural + semantic edges suffice for v1 |
| MCP write review-queue (proposed changes) | Heavy machinery | v1 uses confirm-on-destructive + audit log |
| Live bidirectional git sync | Conflict complexity | v1 = auto-push / manual-or-scheduled pull |
| Git LFS for attachments | Not needed initially | Known bloat note; revisit if vaults grow |
| Multi-vault / cross-vault search | Scope | Single vault per deployment in v1 |

## Suggested build order (informative, not binding)

1. `core` engine: vault model, frontmatter/id, markdown parse, wiki-link resolve,
   tags. + file-watcher + re-index pipeline against a local vault.
2. Postgres schema + indexer writing cache tables; full-text search.
3. REST API + OpenAPI + auth (accounts, PATs, sessions); page CRUD, tree,
   attachments, git auto-commit.
4. Embeddings provider (local) + semantic search + hybrid fusion.
5. Web frontend: page tree, Milkdown editor, presence/soft-lock, search.
6. Knowledge graph edges + graph API + graph view (edges-on-select).
7. Sharing & ACLs: cascade, named-user grants, view/edit share links.
8. MCP server (remote HTTPS + token), read then write tools.
9. RAG "Ask" (pluggable LLM), opt-in.
10. Remote git sync (push/pull) + conflict UI.
11. Packaging: Docker Compose, TLS, admin settings, audit UI.
