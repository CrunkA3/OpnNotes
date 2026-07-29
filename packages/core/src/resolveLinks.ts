import type { PageNode, ResolvedLink, WikiLink } from "./types.js";

interface Candidate {
  id: string;
  path: string;
}

export type LinkIndex = Map<string, Candidate[]>;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function buildLinkIndex(nodes: PageNode[]): LinkIndex {
  const index: LinkIndex = new Map();

  const add = (key: string, cand: Candidate) => {
    const list = index.get(key) ?? [];
    list.push(cand);
    index.set(key, list);
  };

  for (const n of nodes) {
    const cand: Candidate = { id: n.id, path: n.path };
    add(norm(n.title), cand);
    for (const alias of n.frontmatter.aliases) add(norm(alias), cand);
  }

  return index;
}

function commonPrefixLen(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  let i = 0;
  while (i < as.length && i < bs.length && as[i] === bs[i]) i++;
  return i;
}

export function resolveTarget(index: LinkIndex, srcPath: string, rawTarget: string): string | null {
  const candidates = index.get(norm(rawTarget));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!.id;

  let best = candidates[0]!;
  let bestScore = commonPrefixLen(srcPath, best.path);
  for (const c of candidates.slice(1)) {
    const score = commonPrefixLen(srcPath, c.path);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  return best.id;
}

export function resolvePageLinks(node: PageNode, links: WikiLink[], index: LinkIndex): ResolvedLink[] {
  return links.map((l) => ({
    srcId: node.id,
    rawTarget: l.rawTarget,
    display: l.display,
    anchor: l.anchor,
    dstId: resolveTarget(index, node.path, l.rawTarget),
  }));
}
