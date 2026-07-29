# Editor & Frontend

TypeScript + React SPA, consuming the REST API (via an OpenAPI-generated client)
and a WebSocket channel for presence and live update notifications.

## Editor — Milkdown

- **Milkdown** (ProseMirror + remark). Its native document model **is** the
  markdown AST, so markdown remains the source of truth — no lossy block-JSON
  intermediate.
- Features (v1):
  - Mermaid diagrams
  - Math (KaTeX)
  - Tables, task lists, code blocks with syntax highlighting
  - Slash-command menu for inserting blocks
  - `[[wiki-link]]` autocomplete against page titles/aliases (with "create new")
  - `#hashtag` autocomplete
  - Image/attachment paste & drop → uploaded into the current Page's folder
- On save: the editor serializes to markdown; the API writes `index.md`, updates
  `updated`, commits to git, and triggers re-index. Autosave is debounced.
- **Real-time collaborative editing (Yjs) is deferred.** Milkdown's Yjs support
  keeps the door open without an editor change (see [roadmap.md](roadmap.md)).

## Concurrency UX — soft-lock + presence

- Opening a Page for editing acquires a **soft-lock** (auto-expiring, renewed
  while active).
- Other viewers see the Page read-only with a presence badge: "**{name} is
  editing**".
- Lock owner may be a User or an edit-link **Link-visitor** (display name).
- If the lock can't be acquired (someone else holds it), the user gets read-only +
  "request to edit" / wait.
- The WebSocket channel broadcasts lock acquire/release and "page re-indexed /
  changed on disk" events so open clients refresh.

## Navigation & surfaces

- **Page tree** — sidebar mirroring the vault folder hierarchy; create / rename /
  move / delete Pages (move = drag a subtree). Rename updates `title`; the app
  rewrites inbound wiki-link display text.
- **Page view/edit** — rendered markdown with mermaid/math; toggle to edit
  (subject to lock + ACL).
- **Backlinks panel** — Pages linking to the current Page (from the link index).
- **Search** — a single box:
  - default: **hybrid** keyword + semantic results (ranked list of Pages/passages);
  - an explicit **Ask** action runs RAG and shows a synthesized answer with
    citations (only if an LLM provider is configured).
  - filters: tags, path subtree, updated date.
- **Graph view** — see below.
- **Sharing UI** — per-page: manage user grants, create view/edit **share links**
  (copyable public URL), set expiry, revoke. Shows cascade inheritance and any
  overrides.
- **Admin** — user management (invite/create), PAT management, vault/remote-sync
  settings, provider (embeddings/LLM) configuration.

## Graph view

- Renders the knowledge graph (see [knowledge-graph.md](knowledge-graph.md)).
- **Edges are hidden until a node is selected.** Selecting a node reveals its
  incident edges (and highlights neighbor nodes); deselecting hides them again.
  This keeps large graphs readable.
- Edge kinds are visually distinguished (link / hierarchy / shared-tag /
  semantic) with a toggle to show/hide semantic-similarity edges independently.
- Clicking a node navigates to the Page; the current Page is emphasized.
- Layout: force-directed; supports filtering by tag/subtree.

## Public share pages

- A **view** share link renders a clean, read-only page (with mermaid/math), no
  editing chrome, no sidebar by default.
- An **edit** share link prompts once for a **display name**, then allows editing
  subject to the soft-lock; edits are attributed to that name.
- Share pages respect **cascade**: a shared Page's subpages are reachable under
  the same link unless overridden.
