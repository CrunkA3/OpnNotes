# 00 — Overview

## Vision

A self-hosted, open note-taking app where your knowledge lives as plain markdown
files you fully own, but which is enriched by modern capabilities: semantic
search, an emergent knowledge graph, a rich editor, and first-class API + MCP
access so both humans and AI agents can read and maintain the knowledge base.

## Principles

1. **Files are truth.** The markdown vault is the sole source of truth for note
   content and structure. If you delete the database, everything except user
   accounts, permissions, and share links can be rebuilt by re-scanning the files.
2. **Portable and legible.** A note is a plain `.md` file with human-readable
   YAML frontmatter and wiki-links. You can `git clone` the vault and read it in
   any editor without OpnNotes.
3. **Derived state is disposable.** Search index, embeddings, backlinks, and the
   knowledge graph are caches. They are never authoritative and are always
   rebuildable from the files.
4. **One engine, many surfaces.** The web UI, REST API, and MCP server all sit on
   top of the same `core` note engine. No surface has privileged logic the others
   lack.
5. **Every write is attributable.** Web, API, MCP, and share-link edits all carry
   an identity and are audit-logged; git commits record that identity as author.

## Architecture at a glance

```
                       ┌───────────────────────────────────────────┐
                       │                Web frontend                │
                       │   React + Milkdown editor + graph view     │
                       └───────────────▲───────────────────────────┘
                                       │ REST (OpenAPI) + WebSocket (presence)
┌──────────────┐   MCP (HTTPS+token)   │
│  AI agents,  ├───────────────────────┤
│ Home Assist. │                       │
└──────────────┘            ┌──────────▼───────────┐
                            │      API server       │  REST + OpenAPI
                            │  (auth, ACL, routes)  │
                            └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │     core engine       │  parse, ids, links,
                            │  (shared TS package)  │  frontmatter, graph,
                            └──┬─────────┬────────┬─┘  search orchestration
                               │         │        │
              ┌────────────────▼──┐  ┌───▼────┐ ┌─▼───────────────────┐
              │  Markdown vault    │  │Postgres│ │ Providers (pluggable)│
              │ (folder-per-page,  │  │  +     │ │  Embeddings: local   │
              │  git repo, TRUTH)  │  │pgvector│ │  LLM: configurable   │
              └────────▲───────────┘  └────────┘ └──────────────────────┘
                       │
              ┌────────┴───────────┐
              │ file-watcher +      │  detects web/API/MCP/direct-FS/git-pull
              │ re-index pipeline   │  edits → reparse, links, embed, graph
              └────────▲───────────┘
                       │ push / pull
              ┌────────┴───────────┐
              │  Remote git remote  │  optional (GitHub / any)
              └────────────────────┘
```

## Components

- **`core`** — shared TypeScript package. Markdown parsing (unified/remark),
  frontmatter read/write, id management, wiki-link resolution & rewriting, tag
  extraction, graph construction, search orchestration, ACL resolution. Used by
  the API server, MCP server, and indexer.
- **API server** — REST + OpenAPI. Authentication (sessions + PATs), ACL
  enforcement, routes for pages/search/graph/sharing/admin. Serves a WebSocket
  channel for presence and live index/update notifications.
- **MCP server** — remote MCP over HTTPS with token auth. Read + write tools that
  reuse `core`. Runs as a user identity via a scoped PAT.
- **Indexer / file-watcher** — watches the vault for changes from *any* source
  (web save, API, MCP, direct FS edit, `git pull`), reconciles them into Postgres:
  re-parse, resolve links/backlinks, re-embed, rebuild graph edges.
- **Web frontend** — React SPA. Milkdown editor, page tree, search, "Ask", graph
  view, sharing UI, admin.
- **Datastore** — PostgreSQL + pgvector (relational + full-text + vector).
- **Providers** — pluggable `Embeddings` and `LLM` interfaces; local-default
  embeddings, operator-configurable LLM.

## Deployment

Self-hosted via Docker Compose (app + Postgres). The markdown vault is a mounted
volume that is also a git repository. TLS is required for the public MCP endpoint
and share links.

See [roadmap.md](roadmap.md) for what is in v1 vs. deferred.
