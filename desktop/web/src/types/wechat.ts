export interface WeChatAccount {
  account_id: string;
  name: string;
  created_at?: string;
  last_used?: string;
  logged_in: boolean;
  is_default?: boolean;
}

export interface WeChatLoginEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
}

export interface PublishHistoryItem {
  id: string;
  title: string;
  type: 'image' | 'article';
  status: string;
  publish_time: string;
  images_count: number;
  account_id: string;
}
