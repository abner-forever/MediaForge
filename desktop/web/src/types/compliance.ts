export interface DuplicateCheckResult {
  duplicate: boolean;
  similar_titles: { title: string; source: string; similarity: number }[];
}
