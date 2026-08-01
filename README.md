# OpnNotes

A TypeScript monorepo for indexing and searching a local Markdown note vault backed by PostgreSQL.

Notes live on disk as `index.md` files inside named directories (one directory = one page). The indexer watches for changes and keeps the database in sync, enabling fast full-text search and bi-directional wiki-link resolution.

## Packages

| Package | Description |
|---|---|
| [`@opnnotes/core`](packages/core) | Parses Markdown pages: frontmatter, headings, wiki-links, inline tags |
| [`@opnnotes/db`](packages/db) | PostgreSQL schema, migrations, and repository helpers |
| [`@opnnotes/indexer`](packages/indexer) | File-system watcher that reindexes pages on change |

## Vault structure

```
vault/
├── my-note/
│   └── index.md
├── projects/
│   ├── index.md          ← parent page
│   └── roadmap/
│       └── index.md      ← child page (parentPath = "projects")
```

Each `index.md` carries YAML frontmatter:

```markdown
---
id: 01J7ABCDEF1234567890ABCDEF   # ULID, auto-generated on first index
title: My Note
tags: [typescript, notes]
aliases: [my note]
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
---

Note body with [[wiki-links]] and #inline-tags.
```

## Requirements

- Node.js ≥ 20
- pnpm
- PostgreSQL (with the `vector` extension)

## Setup

```bash
pnpm install
```

Start the full stack (application + PostgreSQL with pgvector) via Docker Compose:

```bash
docker compose up --build -d
```

Copy the example environment file and set your password:

```bash
cp .env.example .env
# edit .env and set POSTGRES_PASSWORD to a value of your choice
```

Connection string (update `changeme` to match your `POSTGRES_PASSWORD`):

```
DATABASE_URL=postgresql://opnnotes:changeme@localhost:5432/opnnotes
```

Run all tests:

```bash
pnpm test
```

Run tests in Docker:

```bash
docker build -t opnnotes .
docker run --rm opnnotes
```

Type-check all packages:

```bash
pnpm typecheck
```

## Database

Apply migrations against your PostgreSQL instance:

```typescript
import { createClient, migrate } from "@opnnotes/db";

const sql = createClient(process.env.DATABASE_URL);
await migrate(sql);
```

The schema creates:

- **`pages`** — one row per note (id, path, title, tags, aliases, timestamps, content hash)
- **`page_fts`** — `tsvector` index for full-text search
- **`links`** — resolved and unresolved wiki-links between pages

## Indexing

Index an entire vault once:

```typescript
import { createClient } from "@opnnotes/db";
import { rebuild } from "@opnnotes/indexer";

const sql = createClient(process.env.DATABASE_URL);
await rebuild(sql, "/path/to/vault");
```

Watch for live changes:

```typescript
import { createWatcher } from "@opnnotes/indexer";

const watcher = createWatcher(sql, "/path/to/vault", () => new Date().toISOString());
await watcher.ready;

// later…
await watcher.close();
```

## Search

```typescript
import { keywordSearch } from "@opnnotes/db";

const hits = await keywordSearch(sql, "typescript notes", 10);
// [{ id, path, title, rank }, ...]
```
