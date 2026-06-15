export interface MaterialsGroup {
  celebrity: string;
  scenes: {
    scene: string;
    posts: { post_id: string; images: string[] }[];
    total: number;
  }[];
  total: number;
}

export interface MaterialsData {
  groups: MaterialsGroup[];
  total_images: number;
}

/* ── 文件夹管理类型 ─────────────────────────── */

export interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  item_count: number;
  children: TreeNode[];
  files: TreeNode[];
}

export interface BrowseFolder {
  name: string;
  path: string;
  type: 'folder';
  item_count: number;
}

export interface BrowseFile {
  name: string;
  path: string;
  type: 'file';
  size: number;
  suffix: string;
}

export interface BrowseResult {
  folders: BrowseFolder[];
  files: BrowseFile[];
  breadcrumb: { name: string; path: string }[];
}

export interface TreeResult {
  tree: TreeNode[];
}

export interface MaterialMeta {
  path: string;
  tags: string[];
  source_platform: string;
  source_url: string;
  used_count: number;
  used_in_articles: string[];
  is_cover: boolean;
  celebrity: string;
  scene: string;
  scored: boolean;
  score: number;
  score_reason: string;
}

export interface MaterialsTagsResponse {
  tags: string[];
  celebrities: string[];
  scenes: string[];
}

export interface MetadataResponse {
  meta: Record<string, MaterialMeta> | MaterialMeta | null;
}

export interface CoverImage {
  path: string;
  name: string;
  source: 'local' | 'web';
  celebrity: string;
}
