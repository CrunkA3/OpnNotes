# Sharing & Auth

## Authentication

- **Local accounts** (email + password + server sessions) in v1. Admin
  invites/creates users; optional open signup is a config toggle.
- **Personal Access Tokens (PATs)** authenticate machine callers (REST clients,
  MCP agents) as a specific User, inheriting that User's ACLs. Scoped, revocable,
  optional expiry. Presented as `Authorization: Bearer <pat>`.
- Passwords hashed with a modern KDF (argon2id). Tokens stored only as hashes.
- **OIDC / SSO is deferred** but the auth layer is abstracted so it can slot in
  later. See [roadmap.md](roadmap.md).

## Identities & attribution

Every write carries an **Identity**, recorded in `audit_log` and used as the git
commit author:

- **User** — `user:<id>` (display name + email).
- **Link-visitor** — `link:<share_link_id>` + a **display name** the visitor
  provides once for an **edit** link. View links need no identity.

## Access control (ACLs)

- Permissions: **`view`** and **`edit`** (`edit` implies `view`). Page owners and
  admins always have full access.
- Grants are stored in `acl_grants`, keyed on the Page **`id`**.
- **Cascade resolution:** to decide a caller's permission on a Page, walk *up* the
  page tree (folder ancestry) to the nearest explicit grant for that caller. A
  descendant may carry an **override** grant (including a "private" override that
  stops inheritance).
- Search, graph, and API/MCP responses are **ACL-filtered**: callers only ever
  see Pages they may view.

## Sharing

Two mechanisms, both cascade to subpages with per-subpage override:

### 1. Named-user sharing

- Grant a specific User `view` or `edit` on a Page (and its subtree). The user
  accesses it logged in.

### 2. Share links (public URLs)

- Create an unguessable-token URL for a Page. **Mode chosen per link: `view` or
  `edit`.**
- **View link** — anonymous read-only access; no name required. Renders a clean
  public page.
- **Edit link** — visitor is prompted **once** for a **display name** (stored in
  their browser session against the token). Edits are attributed as
  "{name} (via '{link name}')", giving the soft-lock an owner and the audit log a
  name — no full account required.
- Links are **revocable** and support an **optional expiry**.
- Multiple links per Page are allowed (e.g. a public view link + a scoped edit
  link).
- Because grants key on Page `id`, share URLs survive renames/moves and a full
  cache rebuild.

### Safety

- All writes (web/API/MCP/share-link) respect the same soft-lock, ACLs, and audit
  logging.
- Destructive operations (delete/move) via API/MCP require explicit confirmation.
- Public endpoints (share links, MCP) require TLS; share tokens and PATs are
  rate-limited and revocable.
