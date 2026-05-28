export interface Post {
  id?: string | number;
  celebrity: string;
  scene: string;
  text?: string;
  images: string[];
  local_images?: string[];
  dropped_count?: number;
  screen_name?: string;
  created_at?: string;
}

export interface ScoreInfo {
  score: number;
  reason: string;
  method: string;
}

export interface DiscoveryResult {
  success: boolean;
  posts: Post[];
  total_posts: number;
  total_images: number;
}

export interface DownloadStreamEvent {
  type: 'start' | 'progress' | 'done';
  total?: number;
  current?: number;
  celebrity?: string;
  scene?: string;
  downloaded?: number;
  dropped?: number;
}

export interface SearchStreamEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
  total_posts?: number;
  total_images?: number;
}
