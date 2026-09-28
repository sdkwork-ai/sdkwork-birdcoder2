export interface PageInfo {
  mode: 'offset' | 'cursor';
  pageSize: number;
  nextCursor?: string | null;
  hasMore: boolean;
}
