export interface PipelineConfig {
  platform: string;
  mode: string;
  celebrities: string[];
  search_tags: string[];
  super_topics: string[];
  max_pages: number;
  post_limit: number;
  dry_run: boolean;
  require_confirm: boolean;
  account_id?: string;
  filter_watermark: boolean;
  min_images_per_post: number;
  ai_decision_mode?: string;
}

export interface PipelineEvent {
  type: string;
  step: string;
  [key: string]: unknown;
}

export interface PipelineSummary {
  run_id: string;
  started_at: string;
  total_posts: number;
  total_images: number;
  published: number;
  skipped: number;
  failed: number;
  elapsed_seconds?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  items: Array<{
    title: string;
    celebrity: string;
    images: number;
    score: number;
    status: string;
  }>;
}
