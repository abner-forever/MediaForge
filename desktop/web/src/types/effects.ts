export interface PublishEffect {
  item_id: string;
  title?: string;
  account_id?: string;
  publish_time?: string;
  reads: number;
  likes: number;
  shares: number;
  favorites: number;
  updated_at: string;
  // 新增指标
  comments?: number;
  new_followers?: number;
  // 内容维度标签
  content_type?: 'image' | 'article';
  source_platform?: string;
  celebrity?: string;
  image_count?: number;
  content_url?: string;
  cover?: string;
  comment_num?: number;
}

export interface EffectSummary {
  total_posts: number;
  total_reads: number;
  total_likes: number;
  total_comments: number;
  avg_reads: number;
  avg_likes: number;
  best_publish_hour: number;
  best_day_of_week: number;
  top_celebrities: Array<{ name: string; avg_reads: number; count: number }>;
}

export interface EffectTrendPoint {
  date: string;
  reads: number;
  likes: number;
  posts: number;
}

export interface EffectCompareItem {
  key: string;
  reads: number;
  likes: number;
  posts: number;
}

export interface EffectCompareData {
  by_source_platform: EffectCompareItem[];
  by_content_type: EffectCompareItem[];
  by_celebrity: EffectCompareItem[];
}

export interface MpArticlesResponse {
  articles: (PublishEffect & { item_id: string })[];
  total: number;
  page: number;
  page_size: number;
  celebrities: string[];
}
