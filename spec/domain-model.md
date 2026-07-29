# Domain Model — Ubiquitous Language

This glossary is the shared vocabulary for OpnNotes. Use these exact terms in
code, API, and UI.

## Core entities

- **Vault** — the root folder containing all notes. A git repository. The single
  source of truth for note content and structure. One vault per deployment in v1.

- **Page** — a unit of note content. Physically a folder containing an `index.md`.
  Has a stable **id** (frontmatter), a **title**, a **body** (markdown), **tags**,
  timestamps, zero or more **attachments**, and zero or more **subpages**.

- **Subpage** — a Page whose folder is nested inside another Page's folder. The
  parent/child relationship is expressed purely by folder nesting.

- **index.md** — the file holding a Page's own frontmatter + body. Its parent
  folder name is the Page's human-facing slug/location.

- **Attachment** — a non-markdown file (image, PDF, …) stored inside a Page's
  folder and referenced by relative path from the body. Moves with the Page.

- **Frontmatter** — the YAML block at the top of `index.md`. Carries note-owned
  metadata: `id`, `title`, `tags`, `created`, `updated`, `aliases`. See
  [data-model-and-filesystem.md](data-model-and-filesystem.md).

- **Wiki-link** — an in-body reference to another Page written by title:
  `[[Page Title]]` or `[[Page Title|display text]]`. Resolved to a target id via
  the link index; auto-rewritten when the target's title changes.

- **Backlink** — the inverse of a wiki-link: the set of Pages that link *to* a
  given Page. Derived; stored only as index/graph state.

- **Tag** — a label on a Page. Sourced from the frontmatter `tags` list **and**
  inline `#hashtags` in the body; merged into one set during indexing.

## Identity & people

- **User** — an account (email + password) that can log in. Owns Pages, holds
  ACL grants, and mints PATs.

- **PAT (Personal Access Token)** — a scoped, revocable token that authenticates
  a machine caller (REST client or MCP agent) as a specific User, inheriting that
  User's ACLs.

- **Share link** — an unguessable-token URL granting access to a Page (and, by
  cascade, its subpages) in either **view** or **edit** mode. Revocable, with an
  optional expiry.

- **Link visitor** — someone accessing a Page via a share link without a full
  account. For **edit** links they provide a **display name** used for attribution,
  presence, and lock ownership. View links require no name.

- **Identity** — the actor behind a write: a User, or a Link-visitor
  (display name + originating share link). Recorded in the audit log and as the
  git commit author.

## Access control

- **ACL grant** — a DB record giving a User (or a share link) `view` or `edit`
  permission on a Page. Resolved by walking *up* the page tree to the nearest
  explicit grant (**cascade**).

- **Cascade** — sharing/permission applied to a Page applies to its whole subtree
  unless a descendant has an explicit override.

- **Soft-lock** — a short-lived, auto-expiring editing lock on a Page held by one
  Identity. Others see the Page read-only with a "X is editing" presence badge.
  All write paths (web/API/MCP) respect it.

## Search & knowledge

- **Keyword search** — full-text search over note content (Postgres full-text).

- **Semantic / intent search** — vector-similarity search over note **embeddings**.

- **Hybrid search** — the default: keyword + semantic results score-fused into one
  ranked list. Results are always real Pages/passages.

- **Ask (RAG)** — an opt-in mode that runs an LLM over hybrid-retrieved passages to
  produce a synthesized answer **with citations** to source Pages. An answer is
  derived output, never a note.

- **Embedding** — a vector representation of a Page (or passage) used for semantic
  search and semantic graph edges. Rebuildable. Produced by the local-default
  `Embeddings` provider.

- **Knowledge graph** — nodes = Pages (and, optionally, Tags); edges = wiki-links,
  parent/child hierarchy, shared-tag relations (**structural**), plus
  **semantic-similarity** edges derived from embeddings.

- **Graph view** — the visual rendering of the knowledge graph. A node's edges are
  hidden until that node is **selected**.

## Processes

- **Indexer** — the component that reconciles file changes into DB state.

- **File-watcher** — detects vault changes from any source (web save, API, MCP,
  direct FS edit, `git pull`) and feeds the indexer.

- **Re-index pipeline** — reparse → extract frontmatter/tags/links → resolve
  links & backlinks → embed → rebuild graph edges → update search index.

- **Remote sync** — optional push (automatic, after commits) and pull
  (manual/scheduled) against a configured git **remote** (e.g. GitHub).
