# Data Model & Filesystem

## Vault layout — folder-per-page

Every Page is a **folder** containing an `index.md`. Subpages are nested folders.
Attachments live in the Page's own folder. This makes a Page atomic: its content,
subpages, and attachments all move together.

```
vault/
├─ .git/
├─ Projects/
│  ├─ index.md                 # Page "Projects"
│  ├─ OpnNotes/
│  │  ├─ index.md              # Page "OpnNotes" (subpage of Projects)
│  │  ├─ diagram.png           # attachment of "OpnNotes"
│  │  └─ Ideas/
│  │     └─ index.md           # Page "Ideas" (subpage of OpnNotes)
│  └─ Other Project/
│     └─ index.md
└─ Daily/
   └─ index.md
```

- The **folder name** is the Page's human-facing slug/location. It may be renamed;
  the Page's durable identity is its frontmatter `id`, not the path.
- **Parent/child** is expressed *only* by folder nesting — no `parent` field in
  frontmatter. Moving a Page = moving its folder.
- A Page with no subpages is still a folder with a single `index.md`.

### Reserved / ignored

- Dotfiles and dot-folders (`.git`, `.obsidian`, …) are ignored by the indexer.
- Any folder without an `index.md` is treated as a **non-page container** and its
  markdown descendants are still indexed by walking down to the nearest pages.
  (The indexer logs such folders; the UI may offer to add an `index.md`.)

## Frontmatter schema

The YAML block at the top of every `index.md`. Only note-owned metadata lives
here — never ACLs, shares, or index state.

```yaml
---
id: 01J8ZC7Q9V3K7M2F0X4R
title: OpnNotes
tags: [project, notes-app]
aliases: [Open Notes]
created: 2026-07-29T14:03:00Z
updated: 2026-07-29T16:20:00Z
---
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (ULID) | yes | Immutable. Generated on creation. The durable handle for links, shares, graph, DB rows. |
| `title` | string | yes | Human title. May differ from folder name. Used to resolve `[[wiki-links]]`. |
| `tags` | string[] | no | Merged with inline `#hashtags` at index time. |
| `aliases` | string[] | no | Alternative titles that also resolve `[[...]]` links to this page. |
| `created` | RFC 3339 datetime | yes | Set on creation. |
| `updated` | RFC 3339 datetime | yes | Updated on every content write. |

The canonical machine-readable JSON Schema lives in [api.md](api.md).

**id format:** ULID (Crockford base32, 26 chars) — lexicographically sortable,
URL-safe, collision-resistant, no external coordination needed.

**Missing id:** If the indexer finds an `index.md` without an `id` (e.g. a file a
user dropped in, or a `git pull` of externally-authored notes), it **generates and
writes one** into the frontmatter (a truth-preserving write back to the file).
This is the only case where the indexer mutates a file's content.

## Wiki-links

- Syntax: `[[Page Title]]` or `[[Page Title|display text]]`.
- Resolved to a target `id` via the **link index** by matching against `title`
  then `aliases`.
- **Duplicate titles:** resolve to the nearest Page in the tree (closest common
  ancestor to the linking page). True ambiguity is flagged in the UI; the raw
  markdown is left as written (never silently rewritten to an id).
- **Rename handling:** when a Page's `title` changes, the app rewrites the display
  text in inbound `[[...]]` links so they keep matching. Because links are matched
  by title/alias, adding the old title as an `alias` is the zero-rewrite fallback.
- **Anchor to a heading:** `[[Page Title#Heading]]` supported.
- Links to non-existent titles render as "unresolved" (create-on-click).

## Tags

Merged from two sources during indexing into one set per Page:
1. Frontmatter `tags: [...]`.
2. Inline `#hashtag` tokens in the body (word-boundary, not inside code spans/fences).

## Attachments

- Stored inside the owning Page's folder; referenced by **relative** path from the
  body: `![diagram](diagram.png)`.
- Uploaded via the API/editor into the current Page's folder.
- Move with the Page. Committed to git like any file (Git LFS deferred — see
  [versioning-and-sync.md](versioning-and-sync.md)).

## Database schema (operational state — rebuildable except accounts/shares)

PostgreSQL + pgvector. Rebuildable-from-files tables are marked **(cache)**;
must-persist tables are marked **(persist)**.

```
users (persist)
  id, email (unique), password_hash, display_name, is_admin,
  created_at, updated_at

pats (persist)                         -- personal access tokens
  id, user_id -> users, name, token_hash, scopes (text[]),
  last_used_at, expires_at (null), revoked_at (null), created_at

pages (cache)                          -- one row per indexed Page
  id (ULID, from frontmatter), path (current folder path, unique),
  title, tags (text[]), aliases (text[]),
  created_at, updated_at,              -- mirror of frontmatter
  content_hash, indexed_at

page_fts (cache)                       -- full-text
  page_id -> pages, tsv tsvector       -- GIN index

page_chunks (cache)                    -- passage-level for RAG & semantic search
  id, page_id -> pages, ordinal, text, heading_path,
  embedding vector(<dim>)              -- pgvector; ivfflat/hnsw index

links (cache)                          -- resolved wiki-links
  id, src_page_id -> pages, dst_page_id -> pages (null if unresolved),
  raw_target text, display text, anchor text (null)

graph_edges (cache)                    -- see knowledge-graph.md
  id, kind ('link'|'hierarchy'|'shared_tag'|'semantic'),
  a_page_id -> pages, b_page_id -> pages, weight, meta jsonb

acl_grants (persist)                   -- see sharing-and-auth.md
  id, page_id (ULID), grantee_kind ('user'|'link'),
  user_id (null) -> users, share_link_id (null) -> share_links,
  permission ('view'|'edit'), created_at

share_links (persist)
  id, token_hash (unique), page_id (ULID), mode ('view'|'edit'),
  created_by -> users, expires_at (null), revoked_at (null),
  created_at

link_visitors (persist)                -- lightweight identities for edit links
  id, share_link_id -> share_links, display_name, first_seen_at, last_seen_at

locks (persist, ephemeral)             -- soft-locks; auto-expire
  page_id (ULID), holder_identity jsonb, acquired_at, expires_at

audit_log (persist)
  id, at, identity jsonb, action, page_id (null), detail jsonb

sync_state (persist)                   -- per-vault remote sync config/status
  remote_url (null), last_push_at, last_pull_at, status, last_error (null)
```

**Rebuild guarantee:** dropping every **(cache)** table and re-running the indexer
over the vault fully reconstructs pages, FTS, chunks/embeddings, links, and graph.
**(persist)** tables (accounts, PATs, ACLs, shares, visitors, audit, sync) are the
only state not derivable from files, and are backed up separately.

ACL/share tables key on the Page **`id`** (not path) so shares survive renames and
a full cache rebuild.
