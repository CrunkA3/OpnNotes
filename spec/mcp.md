# MCP Server

A first-class **remote MCP** offering so AI agents (Claude, etc.) and home
automation (Home Assistant) can read **and** maintain the knowledge base.

## Transport & auth

- **Remote MCP over HTTPS** (Streamable-HTTP transport) — connect with just a URL
  + token. No local stdio setup required.
- Auth: a scoped **PAT** presented as a bearer token (header, or token embedded in
  the connect URL for clients like Home Assistant that take a single link).
- The agent acts as the **User** who owns the PAT and inherits that user's ACLs.
- TLS required; tokens are scoped, rate-limited, revocable.
- Every tool call is **audit-logged** with the token's identity.

## Tool surface

Reuses the same `core` engine as the REST API. **Read + write**, ACL- and
soft-lock-respecting, with destructive operations gated by confirmation.

### Read

| Tool | Args | Returns |
|------|------|---------|
| `search_notes` | `query, filters?` | ranked pages/passages (hybrid) |
| `ask_notes` | `query, filters?` | RAG answer + citations (errors if no LLM configured) |
| `read_page` | `id` | frontmatter + body |
| `list_tree` | `rootId?, depth?` | page hierarchy |
| `get_backlinks` | `id` | pages linking here |
| `get_graph` | `rootId?, depth?, kinds?, semanticThreshold?` | nodes + edges |

### Write

| Tool | Args | Notes |
|------|------|-------|
| `create_page` | `parentId?, title, body?` | returns new page id |
| `update_page` | `id, body?, title?, tags?` | respects soft-lock; commits + re-indexes |
| `move_page` | `id, newParentId` | **destructive-ish** → requires `confirm: true` |
| `delete_page` | `id` | **destructive** → requires `confirm: true` (deletes subtree) |
| `add_link` | `srcId, dstId, displayText?` | inserts a `[[wiki-link]]` |

### Resources

- Pages are also exposed as MCP **resources** (`opnnote://page/{id}`) so agents can
  attach note content as context.

## Behavior rules

- **ACL-filtered:** tools only see/modify Pages the token's user may access;
  writes require `edit`.
- **Locks respected:** a write to a Page currently locked by another Identity
  fails with a clear "locked by {name}" error rather than clobbering.
- **Destructive confirmation:** `move_page` / `delete_page` require an explicit
  `confirm: true`; without it they return a preview of what would change.
- **Attribution:** writes are committed to git authored by the token's user and
  recorded in `audit_log`.
- **No review-queue in v1** — writes apply directly (with the safeguards above).
  A proposed-changes review queue is deferred (see [roadmap.md](roadmap.md)).

## Home Assistant use case

A user mints a scoped PAT, pastes the MCP URL + token into Home Assistant, and can
then voice/automate note capture and queries ("add to my Groceries note",
"what did I note about the boiler?") against OpnNotes — all attributed to that
user and ACL-scoped.
