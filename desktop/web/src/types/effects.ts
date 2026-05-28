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
}
