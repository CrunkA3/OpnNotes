# Versioning & Sync

## Git-backed history

The vault **is** a git repository. History, diff, blame, and restore come for
free, and the vault stays portable (clone it and read it anywhere).

- **Auto-commit** on save (debounced). One logical edit → one commit.
- **Author** = the editing **Identity** (User, or edit-link display name). This
  ties git history to the audit log.
- The per-page **soft-lock** already serializes writes to a Page, avoiding
  concurrent-commit races on the same file.
- Attachments are committed like any file. **Git LFS is deferred**; large-binary
  bloat is a known operational note.
- Restore = checking out a prior version of a Page's `index.md`; the file-watcher
  re-indexes it and re-links any retained ACL/share rows by `id`.

## Optional remote sync (GitHub / any git remote)

Per-vault, configurable in admin settings.

- **Configure** a remote URL + credentials (deploy key / PAT). Stored in
  `sync_state`.
- **Push:** automatic after commits → off-site backup; you can browse/edit the
  vault on GitHub.
- **Pull:** manual or scheduled (not live bidirectional in v1, to bound conflict
  complexity).

### Pull = external edits through the existing pipeline

A `git pull` changes files on disk. Those changes flow through the **same
file-watcher + re-index pipeline** as any other external edit (direct FS edits,
API/MCP writes):

1. Pull fetches/merges into the working tree.
2. The file-watcher detects changed/added/removed `index.md` files.
3. The re-index pipeline reparses, ensures ids, resolves links, re-embeds, and
   rebuilds graph edges for the affected Pages.

### Conflict & safety rules

- Before applying a pull to a Page that is **currently soft-locked** for editing,
  the change is **queued/flagged** rather than clobbering the open session; the UI
  surfaces "remote changes waiting".
- **Merge conflicts** (git-level) are surfaced in the UI for resolution; the app
  does not silently auto-resolve content conflicts.
- Externally-authored notes lacking an `id` get one written on index (see
  [search-and-indexing.md](search-and-indexing.md)); this is committed back and
  will push on the next auto-push.

## Rebuild vs. restore

- **Restore a note** → git checkout + re-index.
- **Rebuild the index** → drop cache tables, re-run pipeline over the vault
  (`POST /admin/reindex`).
- **Disaster recovery** → the vault (git, possibly on a remote) restores all note
  content/structure; the **(persist)** DB tables (accounts, PATs, ACLs, shares,
  audit) restore from DB backup. Together they fully reconstitute the system.
