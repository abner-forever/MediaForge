export interface QueueItem {
  id?: string;
  title: string;
  desc: string;
  images: string[];
  cover: string;
  celebrity?: string;
  publish_logs?: string[];
  status?: 'draft' | 'reviewing' | 'queued' | 'saved' | 'saved_to_wechat' | 'published' | 'failed';
  error?: string;
  time?: string;
  /** 文章类型队列项 */
  type?: 'image' | 'article';
  article_id?: string;
  content?: string;
  tags?: string[];
  account_id?: string;
}

export interface PublishLogsResponse {
  logs: string[];
  total: number;
  active: boolean;
}
