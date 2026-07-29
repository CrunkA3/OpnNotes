# Knowledge Graph

A graphify-style knowledge graph derived from the vault. Fully rebuildable from
files + embeddings.

## Nodes

- **Page nodes** (primary) — one per Page (`id`, title, tags, path).
- **Tag nodes** (optional, toggleable) — one per distinct tag, to visualize
  clustering by tag.

## Edges (`graph_edges.kind`)

| kind | meaning | source | deterministic |
|------|---------|--------|---------------|
| `link` | A has a wiki-link to B | resolved `links` | yes (from files) |
| `hierarchy` | A is parent folder of B | folder nesting | yes (from files) |
| `shared_tag` | A and B share ≥1 tag | merged tag sets | yes (from files) |
| `semantic` | A and B are semantically similar | embeddings cosine ≥ threshold | yes (given embeddings) |

- **Structural edges** (`link`, `hierarchy`, `shared_tag`) form the trustworthy,
  file-truthful backbone.
- **Semantic edges** surface emergent "related notes" connections between Pages
  that never explicitly link. Computed from `page_chunks` embeddings:
  - page-to-page similarity = aggregate of chunk similarities (e.g. max or mean of
    top-k chunk pairs);
  - keep an edge when similarity ≥ configurable threshold;
  - cap out-degree (top-N neighbors per Page) to keep the graph sparse and the
    view readable;
  - `weight` = similarity score; `meta` records the contributing chunks.
- Semantic edges are **toggleable independently** in the graph view (hard links vs.
  soft suggestions).

## Refresh

- Structural edges for a Page are recomputed on each re-index of that Page.
- Semantic edges are refreshed when a Page's embeddings change; because they're
  pairwise, an incremental refresh recomputes only edges incident to the changed
  Page (compare its new vector against candidate neighbors via pgvector ANN).
- A full rebuild recomputes all edges from `links` + folder structure + tag sets +
  `page_chunks`.

## Graph API

Exposed via REST and MCP (ACL-filtered — a caller only sees nodes/edges for Pages
they may view):

- `getGraph({ rootId?, depth?, kinds?, includeTags?, semanticThreshold? })`
  → `{ nodes[], edges[] }` for a whole vault or a subtree/neighborhood.
- `getNeighbors(pageId, { kinds?, semanticThreshold? })`
  → edges incident to one Page (this powers the view's "reveal on select").
- `getBacklinks(pageId)` → Pages with a `link` edge into `pageId`.

## Graph view behavior (recap)

- **Edges hidden until a node is selected**; selecting reveals incident edges and
  highlights neighbors. See [editor-frontend.md](editor-frontend.md).

## Deferred

- **LLM entity/concept extraction** (concepts/entities as first-class nodes with
  typed relationships) is deferred — it's non-deterministic and breaks the
  files-are-truth property. See [roadmap.md](roadmap.md).
