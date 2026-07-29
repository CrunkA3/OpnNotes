# OpnNotes — Specification

OpnNotes is an open, self-hosted, multi-user **markdown note-taking web app**. Its
guiding principle: **the markdown files are the only source of truth for note
content and structure.** Everything else (users, permissions, shares, search
index, embeddings, knowledge graph) is operational state in a database — fully
rebuildable from the files, except accounts / permissions / shares.

It offers first-class **MCP** and **REST** interfaces, hybrid **keyword + intent
(semantic) search** with an opt-in RAG "Ask" mode, a **knowledge graph** with a
graph view, page/subpage linking, git-backed history, and per-page sharing with
public view/edit links.

## How to read this spec

| Doc | Contents |
|-----|----------|
| [00-overview.md](00-overview.md) | Vision, principles, high-level architecture, component map |
| [domain-model.md](domain-model.md) | Glossary / ubiquitous language, core entities |
| [data-model-and-filesystem.md](data-model-and-filesystem.md) | Vault layout, frontmatter schema, DB schema, ids, links |
| [editor-frontend.md](editor-frontend.md) | Milkdown editor, presence/locks, graph view, UI surfaces |
| [search-and-indexing.md](search-and-indexing.md) | File-watcher + re-index pipeline, hybrid search, RAG "Ask" |
| [knowledge-graph.md](knowledge-graph.md) | Nodes/edges, structural + semantic edges, graph API |
| [sharing-and-auth.md](sharing-and-auth.md) | Accounts, PATs, ACLs, cascade sharing, share links |
| [api.md](api.md) | REST + OpenAPI sketch, frontmatter JSON Schema |
| [mcp.md](mcp.md) | Remote MCP transport, token auth, tool surface |
| [versioning-and-sync.md](versioning-and-sync.md) | Git-backed history, optional remote (GitHub) sync |
| [roadmap.md](roadmap.md) | v1 scope vs. explicitly deferred work |

## Decision log (summary)

The full rationale for each decision was captured in a grilling session. The
short form:

1. Self-hosted, multi-user, with sharing + public URLs.
2. Content-truth only: files are truth for content/structure; DB is rebuildable state.
3. Page identity = immutable `id` in frontmatter.
4. Folder-per-page with `index.md`; attachments co-located.
5. Wiki-links by title `[[Page]]`, auto-rewritten on rename.
6. TypeScript end-to-end, monorepo with shared `core`.
7. Milkdown editor (markdown-native WYSIWYG).
8. Soft-lock + presence (real-time CRDT deferred).
9. PostgreSQL + pgvector.
10. Tiered search: hybrid retrieval default, opt-in RAG "Ask".
11. Pluggable providers; local-default embeddings, configurable LLM.
12. Structural + semantic knowledge graph; edges shown only when a node is selected.
13. REST + OpenAPI.
14. MCP read **and** write (ACL/lock-respecting, audited); remote HTTPS + token.
15. Local accounts + Personal Access Tokens (OIDC deferred).
16. Cascade sharing with override; view/edit links; edit-link visitors give a display name; links revocable + optional expiry.
17. Git-backed history.
18. Optional remote git sync (auto-push / manual pull) via the file-watcher pipeline.
19. Tags from frontmatter **and** inline `#hashtags`, merged.
20. Spec = this `spec/` folder.
21. v1 scope per [roadmap.md](roadmap.md).
