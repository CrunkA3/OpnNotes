export interface Frontmatter {
  id: string;
  title: string;
  tags: string[];
  aliases: string[];
  created: string;
  updated: string;
  [key: string]: unknown;
}

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

export interface WikiLink {
  rawTarget: string;
  display?: string;
  anchor?: string;
}

export interface ParsedPage {
  frontmatter: Frontmatter;
  body: string;
  headings: Heading[];
  wikiLinks: WikiLink[];
  tags: string[];
}

export interface PageNode {
  id: string;
  path: string;
  title: string;
  parentPath: string | null;
  frontmatter: Frontmatter;
  body: string;
  tags: string[];
}

export interface ResolvedLink {
  srcId: string;
  rawTarget: string;
  display?: string;
  anchor?: string;
  dstId: string | null;
}
