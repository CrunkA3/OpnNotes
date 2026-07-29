# REST API

Language-agnostic **REST + OpenAPI**. The OpenAPI document is the contract;
clients (including the web frontend) are generated from it. Below is a sketch of
the surface, not the final OpenAPI YAML — that document is authored during
implementation from this sketch.

## Conventions

- Base path: `/api/v1`.
- Auth: session cookie (web) or `Authorization: Bearer <PAT>` (machines).
- All responses ACL-filtered to the caller's identity.
- Pages are addressed by **`id`** (durable) — path is metadata, not identity.
- Errors: RFC 7807 problem+json.

## Resources & routes (sketch)

### Pages

```
GET    /pages/tree                      -> page hierarchy (ACL-filtered)
GET    /pages/{id}                      -> page (frontmatter + body + resolved links)
GET    /pages/{id}/raw                  -> raw index.md markdown
POST   /pages                           -> create page {parentId?, title, body?}
PUT    /pages/{id}                      -> update body/frontmatter (respects lock)
PATCH  /pages/{id}/move                 -> move under new parent {newParentId}
PATCH  /pages/{id}/rename               -> rename (updates title; rewrites inbound links)
DELETE /pages/{id}                      -> delete (subtree); requires confirm flag
GET    /pages/{id}/backlinks            -> pages linking here
POST   /pages/{id}/attachments          -> upload attachment (multipart)
GET    /pages/{id}/attachments/{name}   -> fetch attachment
```

### Locks & presence

```
POST   /pages/{id}/lock                 -> acquire/renew soft-lock
DELETE /pages/{id}/lock                 -> release lock
WS     /ws                              -> presence + "page changed/re-indexed" events
```

### Search

```
POST   /search        {query, filters?, mode: "hybrid"}   -> ranked pages/passages
POST   /ask           {query, filters?}                    -> RAG answer + citations
                                                              (409 if no LLM configured)
```

### Graph

```
GET    /graph         ?rootId=&depth=&kinds=&includeTags=&semanticThreshold=
GET    /graph/{id}/neighbors                               -> incident edges (reveal-on-select)
```

### Sharing & access

```
GET    /pages/{id}/acl                  -> grants + cascade info
POST   /pages/{id}/acl                  -> grant user {userId, permission}
DELETE /pages/{id}/acl/{grantId}
POST   /pages/{id}/share-links          -> create link {mode: view|edit, expiresAt?}
GET    /pages/{id}/share-links
DELETE /share-links/{id}                -> revoke
```

Public (unauthenticated / link-token) surface:

```
GET    /s/{token}                       -> shared page (view) / prompts name (edit)
POST   /s/{token}/identity              -> register edit-link display name
PUT    /s/{token}                       -> edit via edit-link (respects lock)
```

### Auth & admin

```
POST   /auth/login  /auth/logout  /auth/me
GET/POST/DELETE /pats                    -> manage personal access tokens
GET/POST /admin/users                    -> admin: manage users (invite/create)
GET/PUT  /admin/settings                 -> vault, providers, remote-sync config
GET      /admin/audit                    -> audit log
POST     /admin/reindex                  -> trigger full rebuild
POST     /admin/sync/push  /admin/sync/pull
```

## Frontmatter JSON Schema (canonical)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opnnotes.dev/schemas/frontmatter.json",
  "title": "OpnNotes Page Frontmatter",
  "type": "object",
  "required": ["id", "title", "created", "updated"],
  "additionalProperties": true,
  "properties": {
    "id":       { "type": "string", "pattern": "^[0-9A-HJKMNP-TV-Z]{26}$",
                  "description": "ULID, immutable" },
    "title":    { "type": "string", "minLength": 1 },
    "tags":     { "type": "array", "items": { "type": "string" }, "default": [] },
    "aliases":  { "type": "array", "items": { "type": "string" }, "default": [] },
    "created":  { "type": "string", "format": "date-time" },
    "updated":  { "type": "string", "format": "date-time" }
  }
}
```

`additionalProperties: true` — foreign frontmatter keys (e.g. from an imported
Obsidian vault) are preserved on write, never dropped.
